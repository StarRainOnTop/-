import { SlashCommandBuilder } from 'discord.js';
import { successEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const EMBED_DESCRIPTION_LIMIT = 4096;

export default {
    data: new SlashCommandBuilder()
    .setName("fight")
    .setDescription("開始一場模擬的 1v1 文字對決。")
    .addUserOption((option) =>
      option
        .setName("opponent")
        .setDescription("要挑戰的對象。")
        .setRequired(true),
    ),
  category: 'Fun',

  async execute(interaction, config, client) {
    await InteractionHelper.safeDefer(interaction);

    const challenger = interaction.user;
    const opponent = interaction.options.getUser("opponent");

    if (challenger.id === opponent.id) {
      const embed = warningEmbed(
        "⚔️ 無效的挑戰",
        `**${challenger.username}**，你不能跟自己打架！這在開始之前就已經平手了。`
      );
      return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }

    if (opponent.bot) {
      const embed = warningEmbed(
        "⚔️ 無效的對手",
        "你不能跟機器人打架！請改為挑戰真人。"
      );
      return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }

    const winner = rand(0, 1) === 0 ? challenger : opponent;
    const loser = winner.id === challenger.id ? opponent : challenger;
    const rounds = rand(3, 7);
    const damage = rand(10, 50);

    const log = [];
    log.push(
      `💥 **${challenger.username}** 挑戰 **${opponent.username}** 進行決鬥！（進行 ${rounds} 回合制）`,
    );

    for (let i = 1; i <= rounds; i++) {
      const attacker = rand(0, 1) === 0 ? challenger : opponent;
      const target = attacker.id === challenger.id ? opponent : challenger;
      const action = [
        "揮出一記狂亂的拳擊",
        "打出了致命一擊",
        "使出了一個微弱的法術",
        "招架並發起了反擊",
      ][rand(0, 3)];
      log.push(
        `\n**第 ${i} 回合：** ${attacker.username} 對 ${target.username} ${action}，造成了 ${rand(1, damage)} 點傷害！`,
      );
    }

    const outcomeText = log.join("\n");
    const winnerText = `👑 **${winner.username}** 擊敗了 ${loser.username} 並贏得了勝利！`;
    const fullDescription = `${outcomeText}\n\n${winnerText}`;

    const description = fullDescription.length <= EMBED_DESCRIPTION_LIMIT
      ? fullDescription
      : `${fullDescription.slice(0, EMBED_DESCRIPTION_LIMIT - 15)}\n\n...`;

    const embed = successEmbed(
      "🏆 決鬥結束！",
      description
    );

    await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    logger.debug(`Fight 指令已在伺服器 ${interaction.guildId} 中由 ${challenger.id} 和 ${opponent.id} 執行`);
  },
};
