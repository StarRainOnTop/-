import { SlashCommandBuilder, version, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
    .setName("stats")
    .setDescription("檢視機器人統計數據"),

  async execute(interaction) {
    try {
      await InteractionHelper.safeDefer(interaction);
      
      const totalGuilds = interaction.client.guilds.cache.size;
      const totalMembers = interaction.client.guilds.cache.reduce(
        (acc, guild) => acc + guild.memberCount,
        0,
      );
      const nodeVersion = process.version;

      const embed = createEmbed({ title: "系統統計數據", description: "即時效能指標。" }).addFields(
        { name: "伺服器", value: `${totalGuilds}`, inline: true },
        { name: "使用者", value: `${totalMembers}`, inline: true },
        { name: "Node.js", value: `${nodeVersion}`, inline: true },
        { name: "Discord.js", value: `v${version}`, inline: true },
        {
          name: "記憶體使用量",
          value: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
          inline: true,
        },
      );

      await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    } catch (error) {
      logger.error('Stats 指令發生錯誤：', error);
      return InteractionHelper.safeEditReply(interaction, {
        embeds: [createEmbed({ title: '系統錯誤', description: '無法取得系統統計數據。', color: 'error' })],
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
