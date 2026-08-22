import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("取得伺服器的詳細資訊"),

  async execute(interaction) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) {
      logger.warn(`ServerInfo interaction defer failed`, {
        userId: interaction.user.id,
        guildId: interaction.guildId,
        commandName: 'serverinfo'
      });
      return;
    }

    const guild = interaction.guild;
    const owner = await guild.fetchOwner();

    const createdTimestamp = Math.floor(guild.createdAt.getTime() / 1000);

    const embed = createEmbed({ title: `伺服器資訊：${guild.name}`, description: `伺服器 ID：${guild.id}` })
      .setThumbnail(guild.iconURL({ size: 256 }))
      .addFields(
        { name: "擁有者", value: owner.user.tag, inline: true },
        { name: "成員數", value: `${guild.memberCount}`, inline: true },
        {
          name: "頻道數",
          value: `${guild.channels.cache.size}`,
          inline: true,
        },
        { name: "身分組數", value: `${guild.roles.cache.size}`, inline: true },
        {
          name: "伺服器加成",
          value: `等級 ${guild.premiumTier} (${guild.premiumSubscriptionCount} 次加成)`,
          inline: true,
        },
        {
          name: "建立日期",
          value: `<t:${createdTimestamp}:R>`,
          inline: true,
        },
      );

    await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    logger.info(`ServerInfo command executed`, {
      userId: interaction.user.id,
      guildId: guild.id,
      guildName: guild.name,
      memberCount: guild.memberCount
    });
  },
};
