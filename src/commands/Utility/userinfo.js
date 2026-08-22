import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("取得使用者的詳細資訊")
    .addUserOption((option) =>
      option
        .setName("target")
        .setDescription("要檢視的使用者 (預設為你自己)"),
    ),

  async execute(interaction) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) {
      logger.warn(`UserInfo interaction defer failed`, {
        userId: interaction.user.id,
        guildId: interaction.guildId,
        commandName: 'userinfo'
      });
      return;
    }

    const user = interaction.options.getUser("target") || interaction.user;
    const member = interaction.guild.members.cache.get(user.id);

    const createdTimestamp = Math.floor(user.createdAt.getTime() / 1000);
    const joinedTimestamp = member?.joinedAt ? Math.floor(member.joinedAt.getTime() / 1000) : null;

    const embed = createEmbed({ title: `使用者資訊：${user.username}` })
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: "ID", value: user.id, inline: true },
        { name: "機器人", value: user.bot ? "是" : "否", inline: true },
        {
          name: "身分組",
          value:
            member && member.roles.cache.size > 1
              ? member.roles.cache
                  .map((r) => r.name)
                  .slice(0, 5)
                  .join(",")
              : "無",
          inline: true,
        },
        {
          name: "帳號建立時間",
          value: `<t:${createdTimestamp}:R>`,
          inline: false,
        },
        {
          name: "加入伺服器時間",
          value: joinedTimestamp ? `<t:${joinedTimestamp}:R>` : "不在伺服器中",
          inline: false,
        },
        {
          name: "最高身分組",
          value: member?.roles?.highest?.name || "無",
          inline: true,
        },
      );

    await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    logger.info(`UserInfo command executed`, {
      userId: interaction.user.id,
      targetUserId: user.id,
      guildId: interaction.guildId
    });
  },
};
