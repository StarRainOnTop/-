import { createEmbed } from '../../../utils/embeds.js';
import { getGuildConfig } from '../../../services/config/guildConfig.js';
import { logEvent, EVENT_TYPES, resolveLogChannel } from '../../../services/loggingService.js';
import { formatLogLine, resolveUserAuthor } from '../../../utils/logging/logEmbeds.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
import { logger } from '../../../utils/logger.js';

export default {
    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, { ephemeral: true });
        if (!deferSuccess) {
            logger.warn('Report interaction defer failed', { userId: interaction.user.id, guildId: interaction.guildId });
            return;
        }

        const targetUser = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason');
        const guildId = interaction.guildId;

        const guildConfig = await getGuildConfig(client, guildId);
        const reportChannelId = resolveLogChannel(guildConfig, 'reports');

        if (!reportChannelId) {
            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: '尚未設定檢舉頻道。請要求管理員使用 `/logging dashboard` 或 `/logging channel`。' });
        }

        const ownerMention = interaction.guild.ownerId
            ? `<@${interaction.guild.ownerId}> 有新的檢舉！`
            : '有新的檢舉！';

        await logEvent({
            client,
            guildId,
            eventType: EVENT_TYPES.REPORT_FILE,
            content: ownerMention,
            data: {
                title: '使用者檢舉',
                lines: [
                    formatLogLine('被檢舉使用者', `${targetUser.tag} (\`${targetUser.id}\`)`),
                    formatLogLine('檢舉者', `${interaction.user.tag} (\`${interaction.user.id}\`)`),
                    formatLogLine('頻道', interaction.channel.toString()),
                ],
                blockFields: [{ name: '原因', value: reason }],
                author: await resolveUserAuthor(client, targetUser.id),
                thumbnail: targetUser.displayAvatarURL(),
            },
        });

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [createEmbed({
                title: '檢舉已提交',
                description: `您對 **${targetUser.tag}** 的檢舉已成功提交並傳送至管理團隊。謝謝您！`,
            })],
        });

        logger.info('Report submitted', {
            userId: interaction.user.id,
            reportedUserId: targetUser.id,
            guildId,
            reasonLength: reason.length,
        });
    },
};
