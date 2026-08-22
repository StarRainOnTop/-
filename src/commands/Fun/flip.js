import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
    .setName("flip")
    .setDescription("拋硬幣（正面或反面）。"),
  category: 'Fun',

  async execute(interaction, config, client) {
    const result = Math.random() < 0.5 ? "正面" : "反面";
    const emoji = result === "正面" ? "🪙" : "🔮";

    const embed = successEmbed(
      "正面還是反面？",
      `硬幣落在了... **${result}** ${emoji}！`,
    );

    await InteractionHelper.safeReply(interaction, { embeds: [embed] });
    logger.debug(`Flip 指令已由使用者 ${interaction.user.id} 在伺服器 ${interaction.guildId} 中執行`);
  },
};
