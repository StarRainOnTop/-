import { botConfig, getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { createEmbed, infoEmbed, successEmbed } from '../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../services/config/guildConfig.js';
import { withErrorHandling, createError, ErrorTypes, replyUserError } from '../../utils/errorHandler.js';
import { removeVerification, verifyUser } from '../../services/verificationService.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getWelcomeConfig } from '../../utils/database.js';
import verificationDashboard from './modules/verification_dashboard.js';

export default {
    data: new SlashCommandBuilder()
        .setName("verification")
        .setDescription("Manage the server verification system")
        .addSubcommand(subcommand =>
            subcommand
                .setName("setup")
                .setDescription("Set up the verification system with one or multiple roles")
                .addChannelOption(option =>
                    option
                        .setName("verification_channel")
                        .setDescription("Channel where verification messages will be sent")
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
                .addRoleOption(option =>
                    option
                        .setName("verified_role")
                        .setDescription("Primary role to give to verified users")
                        .setRequired(true)
                )
                .addRoleOption(option =>
                    option
                        .setName("extra_role_1")
                        .setDescription("Additional role to give upon verification (Optional)")
                        .setRequired(false)
                )
                .addRoleOption(option =>
                    option
                        .setName("extra_role_2")
                        .setDescription("Another additional role to give upon verification (Optional)")
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option
                        .setName("message")
                        .setDescription("Custom verification message")
                        .setMaxLength(2000)
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option
                        .setName("button_text")
                        .setDescription("Text for the verification button")
                        .setMaxLength(80)
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("remove")
                .setDescription("Remove verification from a user")
                .addUserOption(option =>
                    option
                        .setName("user")
                        .setDescription("User to remove verification from")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("dashboard")
                .setDescription("Open the verification system configuration dashboard")
        ),

    async execute(interaction, config, client) {
        const wrappedExecute = withErrorHandling(async () => {
            const subcommand = interaction.options.getSubcommand();
            const guild = interaction.guild;

            if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
                throw createError(
                    'Missing ManageGuild permission for verification admin subcommand',
                    ErrorTypes.PERMISSION,
                    'You need the **Manage Server** permission to use this verification subcommand.',
                    { subcommand, requiredPermission: 'ManageGuild', userId: interaction.user.id }
                );
            }

            switch (subcommand) {
                case "setup":
                    return await handleSetup(interaction, guild, client);
                case "remove":
                    return await handleRemove(interaction, guild, client);
                case "dashboard":
                    return await verificationDashboard.execute(interaction, config, client);
                default:
                    throw createError(
                        `Unknown subcommand: ${subcommand}`,
                        ErrorTypes.VALIDATION,
                        "Please select a valid subcommand.",
                        { subcommand }
                    );
            }
        }, { command: 'verification', subcommand: interaction.options.getSubcommand() });

        return await wrappedExecute(interaction, config, client);
    }
};

async function handleSetup(interaction, guild, client) {
    const verificationChannel = interaction.options.getChannel("verification_channel");
    const verifiedRole = interaction.options.getRole("verified_role");
    const extraRole1 = interaction.options.getRole("extra_role_1");
    const extraRole2 = interaction.options.getRole("extra_role_2");
    
    // 收集所有選擇要發放的身分組
    const rolesToGive = [verifiedRole];
    if (extraRole1) rolesToGive.push(extraRole1);
    if (extraRole2) rolesToGive.push(extraRole2);

    const message = interaction.options.getString("message") || botConfig.verification.defaultMessage;
    const buttonText = interaction.options.getString("button_text") || botConfig.verification.defaultButtonText;
    const botMember = guild.members.me;

    if (!botMember) {
        throw createError(
            'Bot member not found in guild cache',
            ErrorTypes.CONFIGURATION,
            'I could not verify my permissions in this server. Please try again in a moment.',
            { guildId: guild.id }
        );
    }

    const requiredChannelPermissions = [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks
    ];
    const missingChannelPerms = requiredChannelPermissions.filter(perm => 
        !verificationChannel.permissionsFor(botMember).has(perm)
    );
    
    if (missingChannelPerms.length > 0) {
        throw createError(
            `Missing channel permissions: ${missingChannelPerms.join(', ')}`,
            ErrorTypes.PERMISSION,
            'I need **View Channel**, **Send Messages**, and **Embed Links** in the verification channel.',
            { missingPermissions: missingChannelPerms, channel: verificationChannel.id }
        );
    }

    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        throw createError(
            "Missing ManageRoles permission",
            ErrorTypes.PERMISSION,
            "I need the 'Manage Roles' permission to give verified roles.",
            { missingPermission: "ManageRoles" }
        );
    }

    const botRole = botMember.roles.highest;
    for (const r of rolesToGive) {
        if (r.id === guild.id || r.managed) {
            throw createError(
                'Invalid verified role selected',
                ErrorTypes.VALIDATION,
                `Please choose normal assignable roles (not @everyone or a managed role). Error with: ${r.name}`,
                { roleId: r.id, managed: r.managed }
            );
        }
        if (r.position >= botRole.position) {
            throw createError(
                "Role hierarchy error",
                ErrorTypes.PERMISSION,
                `The role **${r.name}** must be below my highest role in the server role hierarchy.`,
                { rolePosition: r.position, botRolePosition: botRole.position }
            );
        }
    }

    const guildConfig = await getGuildConfig(client, guild.id);
    const welcomeConfig = await getWelcomeConfig(client, guild.id);
    const hasAutoVerifyEnabled = Boolean(guildConfig.verification?.autoVerify?.enabled);
    const hasAutoRoleConfigured = Boolean(guildConfig.autoRole) || (Array.isArray(welcomeConfig.roleIds) && welcomeConfig.roleIds.length > 0);

    if (hasAutoVerifyEnabled || hasAutoRoleConfigured) {
        throw createError(
            'Verification setup blocked by conflicting onboarding system',
            ErrorTypes.CONFIGURATION,
            'You cannot enable the verification system while **AutoVerify** or **AutoRole** is configured. Disable those first.',
            {
                guildId: guild.id,
                hasAutoVerifyEnabled,
                hasAutoRoleConfigured,
                expected: true,
                suppressErrorLog: true
            }
        );
    }

    await InteractionHelper.safeDefer(interaction);

    const verifyEmbed = createEmbed({
        title: "Server Verification",
        description: message,
        color: getColor('success')
    });

    const verifyButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("verify_user")
            .setLabel(buttonText)
            .setStyle(ButtonStyle.Success)
            .setEmoji("✅")
    );

    const verifyMessage = await verificationChannel.send({
        embeds: [verifyEmbed],
        components: [verifyButton]
    });

    // 儲存陣列格式的身分組 ID
    guildConfig.verification = {
        enabled: true,
        channelId: verificationChannel.id,
        messageId: verifyMessage.id,
        roleId: verifiedRole.id, // 相容舊版單一欄位
        roleIds: rolesToGive.map(r => r.id), // 新增多身分組陣列支援
        message: message,
        buttonText: buttonText
    };

    await setGuildConfig(client, guild.id, guildConfig);

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed(
            'Verification System Updated',
            [
                `Channel: ${verificationChannel}`,
                `Assigned Roles: ${rolesToGive.map(r => r.toString()).join(', ')}`,
                `Button Text: ${buttonText}`
            ].join('\n')
        )]
    });
}

async function handleRemove(interaction, guild, client) {
    const targetUser = interaction.options.getUser("user");

    const result = await removeVerification(client, guild.id, targetUser.id, {
        moderatorId: interaction.user.id,
        reason: 'admin_removal'
    });

    if (result.status === 'not_verified') {
        return await InteractionHelper.safeReply(interaction, {
            embeds: [infoEmbed('Not Verified', `${targetUser.tag} does not currently have the verified roles.`)],
            flags: MessageFlags.Ephemeral
        });
    }

    logger.info('Verification removed via command', {
        guildId: guild.id,
        targetUserId: targetUser.id,
        moderatorId: interaction.user.id
    });

    return await InteractionHelper.safeReply(interaction, {
        embeds: [successEmbed('Verification Removed', `Verification removed from ${targetUser.tag}.`)]
    });
}
