import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { getUserLevelData, getLevelingConfig, getXpForLevel } from '../../services/leveling/leveling.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('查看你或其他使用者的排位與等級')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('要查看排位的使用者')
        .setRequired(false)
    )
    .setDMPermission(false),
  category: 'Leveling',

  async execute(interaction, config, client) {
    await InteractionHelper.safeDefer(interaction);

    const levelingConfig = await getLevelingConfig(client, interaction.guildId);
    if (!levelingConfig?.enabled) {
      await InteractionHelper.safeEditReply(interaction, {
        embeds: [
          new EmbedBuilder()
            .setColor('#f1c40f')
            .setDescription('本伺服器目前已停用等級系統。')
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const targetUser = interaction.options.getUser('user') || interaction.user;
    const member = await interaction.guild.members
      .fetch(targetUser.id)
      .catch(() => null);

    if (!member) {
      throw new TitanBotError(
        `User ${targetUser.id} not found in guild`,
        ErrorTypes.USER_INPUT,
        '在本伺服器中找不到指定的使用者。'
      );
    }

    const userData = await getUserLevelData(client, interaction.guildId, targetUser.id);

    const safeUserData = {
      level: userData?.level ?? 0,
      xp: userData?.xp ?? 0,
      totalXp: userData?.totalXp ?? 0
    };

    const xpNeeded = getXpForLevel(safeUserData.level + 1);
    const progress = xpNeeded > 0 ? Math.floor((safeUserData.xp / xpNeeded) * 100) : 0;
    const progressBar = createProgressBar(progress, 20);

    const embed = new EmbedBuilder()
      .setTitle(`${member.displayName} 的排位`)
      .setThumbnail(member.displayAvatarURL({ dynamic: true }))
      .addFields(
        {
          name: '等級',
          value: safeUserData.level.toString(),
          inline: true
        },
        {
          name: '經驗值 (XP)',
          value: `${safeUserData.xp}/${xpNeeded}`,
          inline: true
        },
        {
          name: '總經驗值',
          value: safeUserData.totalXp.toString(),
          inline: true
        },
        {
          name: `距離升到等級 ${safeUserData.level + 1} 的進度`,
          value: `${progressBar} ${progress}%`
        }
      )
      .setColor('#2ecc71')
      .setTimestamp();

    await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    logger.debug(`Rank checked for user ${targetUser.id} in guild ${interaction.guildId}`);
  }
};

function createProgressBar(percentage, length = 10) {
  if (percentage < 0 || percentage > 100) {
    percentage = Math.max(0, Math.min(100, percentage));
  }
  const filled = Math.round((percentage / 100) * length);
  return '█'.repeat(filled) + '░'.repeat(length - filled);
}
