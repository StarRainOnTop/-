import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
    .setName("uptime")
    .setDescription("檢查機器人線上運行了多長時間"),

  async execute(interaction) {
    try {
      await InteractionHelper.safeDefer(interaction);
      
      let totalSeconds = interaction.client.uptime / 1000;
      let days = Math.floor(totalSeconds / 86400);
      totalSeconds %= 86400;
      let hours = Math.floor(totalSeconds / 3600);
      totalSeconds %= 3600;
      let minutes = Math.floor(totalSeconds / 60);
      let seconds = Math.floor(totalSeconds % 60);

      const uptimeStr = `${days}天 ${hours}小時 ${minutes}分鐘 ${seconds}秒`;

      await InteractionHelper.safeEditReply(interaction, {
        embeds: [createEmbed({ 
          title: "系統運行時間", 
          description: `\`\`\`${uptimeStr}\`\`\`` 
        })],
      });
    } catch (error) {
      logger.error('Uptime 指令發生錯誤：', error);
      
      try {
        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [createEmbed({ title: '系統錯誤', description: '無法計算運行時間。', color: 'error' })],
          flags: MessageFlags.Ephemeral,
        });
      } catch (replyError) {
        logger.error('發送錯誤回覆失敗：', replyError);
      }
    }
  },
};
