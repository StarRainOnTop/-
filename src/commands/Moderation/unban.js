import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { ModerationService } from '../../services/moderation/moderationService.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("unban")
        .setDescription("解除伺服器中某個使用者的封鎖 (Unban)")
        .addStringOption(option =>
            option
                .setName("target")
                .setDescription("要解除封鎖的使用者 ID（或標註）")
                .setRequired(true),
        )
        .addStringOption(option =>
            option.setName("reason")
                .setDescription("解除封鎖的原因")
                .setRequired(false),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Unban interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'unban',
            });
            return;
        }

        const rawTarget = interaction.options.getString("target");
        const targetId = rawTarget.replace(/[<@!>]/g, '').trim();

        if (!/^\d{17,20}$/.test(targetId)) {
            return replyUserError(interaction, {
                type: ErrorTypes.USER_INPUT,
                message: '請提供有效的使用者 ID 或標註。',
            });
        }

        const targetUser = await client.users.fetch(targetId).catch(() => null);
        if (!targetUser) {
            return replyUserError(interaction, {
                type: ErrorTypes.USER_INPUT,
                message: `找不到 ID 為 \`${targetId}\` 的使用者。`,
            });
        }

        const reason = interaction.options.getString("reason") || "未提供原因";

        const result = await ModerationService.unbanUser({
            guild: interaction.guild,
            user: targetUser,
            moderator: interaction.member,
            reason,
        });

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    "✅ 使用者已解除封鎖",
                    `已成功將 **${targetUser.tag}** 解除伺服器封鎖。\n\n**原因：** ${reason}\n**案件編號：** #${result.caseId}`,
                ),
            ],
        });
    },
};
