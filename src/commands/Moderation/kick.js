import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { ModerationService } from '../../services/moderation/moderationService.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName("kick")
        .setDescription("將使用者從伺服器中踢出 (Kick)")
        .addUserOption((option) =>
            option
                .setName("target")
                .setDescription("要踢出的使用者")
                .setRequired(true),
        )
        .addStringOption((option) =>
            option.setName("reason").setDescription("踢出原因"),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        const targetUser = interaction.options.getUser("target");
        const member = interaction.options.getMember("target");
        const reason = interaction.options.getString("reason") || "未提供原因";

        if (!targetUser) {
            throw new TitanBotError(
                'Missing target user',
                ErrorTypes.USER_INPUT,
                '你必須指定要踢出的使用者。',
                { subtype: 'invalid_user' },
            );
        }

        if (targetUser.id === interaction.user.id) {
            throw new TitanBotError(
                "Cannot kick self",
                ErrorTypes.VALIDATION,
                "你不能把自己踢出伺服器。",
            );
        }

        if (targetUser.id === client.user.id) {
            throw new TitanBotError(
                "Cannot kick bot",
                ErrorTypes.VALIDATION,
                "你不能把機器人踢出伺服器。",
            );
        }

        if (!member) {
            throw new TitanBotError(
                "Target not found",
                ErrorTypes.USER_INPUT,
                "目標使用者目前不在本伺服器中。",
                { subtype: 'user_not_found' },
            );
        }

        const result = await ModerationService.kickUser({
            guild: interaction.guild,
            member,
            moderator: interaction.member,
            reason,
        });

        await InteractionHelper.universalReply(interaction, {
            embeds: [
                successEmbed(
                    `👢 **已踢出** ${targetUser.tag}`,
                    `**原因：** ${reason}\n**案件編號：** #${result.caseId}`,
                ),
            ],
        });
    },
};
