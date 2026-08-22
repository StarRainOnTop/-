import { PermissionsBitField, ChannelType } from 'discord.js';
import { setLogChannel } from '../../../services/loggingService.js';
import { successEmbed } from '../../../utils/embeds.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
const DESTINATION_LABELS = {
  audit: '審核記錄',
  applications: '申請記錄',
  reports: '舉報記錄',
};

export default {
  prefixOnly: false,
  async execute(interaction, config, client) {
    try {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
        return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: '你需要 **管理伺服器 (Manage Server)** 權限才能設定日誌頻道。' });
      }

      await InteractionHelper.safeDefer(interaction, { ephemeral: true });

      const destination = interaction.options.getString('destination');
      const channel = interaction.options.getChannel('channel');
      const disable = interaction.options.getBoolean('disable') ?? false;

      if (disable) {
        await setLogChannel(client, interaction.guildId, destination, null);
        return InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed(
            '已清除頻道',
            `已移除 **${DESTINATION_LABELS[destination]}** 的日誌頻道。`,
          )],
        });
      }

      if (!channel || channel.type !== ChannelType.GuildText) {
        return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: '請提供一個有效的文字頻道。' });
      }

      const botPerms = channel.permissionsFor(interaction.guild.members.me);
      if (!botPerms?.has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
        return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: `我需要在 ${channel} 中擁有 **檢視頻道 (ViewChannel)**、**發送訊息 (SendMessages)** 與 **嵌入連結 (EmbedLinks)** 權限。` });
      }

      await setLogChannel(client, interaction.guildId, destination, channel.id);

      return InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed(
          '已更新頻道',
          `**${DESTINATION_LABELS[destination]}** 日誌將會發送到 ${channel}。\n請使用 \`/logging dashboard\` 來切換事件分類。`,
        )],
      });
    } catch (error) {
      logger.error('logging_channel error:', error);
      await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: '更新日誌頻道失敗。' });
    }
  },
};
