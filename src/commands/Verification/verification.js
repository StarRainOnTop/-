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
        .setDescription("管理伺服器驗證系統")
        .addSubcommand(subcommand =>
            subcommand
                .setName("setup")
                .setDescription("使用一個或多個身分組設定驗證系統")
                .addChannelOption(option =>
                    option
                        .setName("verification_channel")
                        .setDescription("將發送驗證訊息的頻道")
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
                .addRoleOption(option =>
                    option
                        .setName("verified_role")
                        .setDescription("要給予已驗證使用者的主要身分組")
                        .setRequired(true)
                )
                .addRoleOption(option =>
                    option
                        .setName("extra_role_1")
                        .setDescription("驗證時給予的額外身分組（選填）")
                        .setRequired(false)
                )
                .addRoleOption(option =>
                    option
                        .setName("extra_role_2")
                        .setDescription("驗證時給予的另一個額外身分組（選填）")
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option
                        .setName("message")
                        .setDescription("自訂驗證訊息")
                        .setMaxLength(2000)
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option
                        .setName("button_text")
                        .setDescription("驗證按鈕的文字")
                        .setMaxLength(80)
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("remove")
                .setDescription("從使用者身上移除驗證")
                .addUserOption(option =>
                    option
                        .setName("user")
                        .setDescription("要移除驗證的使用者")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("dashboard")
                .setDescription("開啟驗證系統設定儀表板")
        ),

    async execute(interaction, config, client) {
        const wrappedExecute = withErrorHandling(async () => {
            const subcommand = interaction.options.getSubcommand();
            const guild = interaction.guild;

            if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
                throw createError(
                    'Missing ManageGuild permission for verification admin subcommand',
                    ErrorTypes.PERMISSION,
                    '你需要 **管理伺服器** 權限才能使用此驗證子指令。',
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
                        "請選擇一個有效的子指令。",
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
            '我無法在此伺服器中驗證我的權限。請稍後再試一次。',
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
            '我需要在驗證頻道中擁有 **檢視頻道**、**傳送訊息** 與 **嵌入連結** 權限。',
            { missingPermissions: missingChannelPerms, channel: verificationChannel.id }
        );
    }

    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        throw createError(
            "Missing ManageRoles permission",
            ErrorTypes.PERMISSION,
            "我需要「管理身分組」權限才能給予驗證身分組。",
            { missingPermission: "ManageRoles" }
        );
    }

    const botRole = botMember.roles.highest;
    for (const r of rolesToGive) {
        if (r.id === guild.id || r.managed) {
            throw createError(
                'Invalid verified role selected',
                ErrorTypes.VALIDATION,
                `請選擇一般可指派的身分組（不能是 @everyone 或受管理的的身分組）。錯誤的身分組：${r.name}`,
                { roleId: r.id, managed: r.managed }
            );
        }
        if (r.position >= botRole.position) {
            throw createError(
                "Role hierarchy error",
                ErrorTypes.PERMISSION,
                `身分組 **${r.name}** 必須在伺服器身分組階層中低於我的最高身分組。`,
                { rolePosition: r.position, botRolePosition: botRole.position }
            );
        }
    }

    const guildConfig = await getGuildConfig(client, guild.id);

    // 已經移除原本會阻擋 AutoRole 的檢查 (hasAutoRoleConfigured 判斷)

    await InteractionHelper.safeDefer(interaction);

    const verifyEmbed = createEmbed({
        title: "伺服器驗證",
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
        roleId: verifiedRole.id, 
        roleIds: rolesToGive.map(r => r.id), 
        message: message,
        buttonText: buttonText
    };

    await setGuildConfig(client, guild.id, guildConfig);

    await InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed(
            '驗證系統已更新',
            [
                `頻道：${verificationChannel}`,
                `指定身分組：${rolesToGive.map(r => r.toString()).join(', ')}`,
                `按鈕文字：${buttonText}`
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
            embeds: [infoEmbed('未驗證', `${targetUser.tag} 目前沒有已驗證的身分組。`)],
            flags: MessageFlags.Ephemeral
        });
    }

    logger.info('Verification removed via command', {
        guildId: guild.id,
        targetUserId: targetUser.id,
        moderatorId: interaction.user.id
    });

    return await InteractionHelper.safeReply(interaction, {
        embeds: [successEmbed('已移除驗證', `已從 ${targetUser.tag} 移除驗證。`)]
    });
}
