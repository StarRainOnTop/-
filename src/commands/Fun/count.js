import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import {
  getCountingGameConfig,
  activateCountingGame,
  disableCountingGame,
  resetCountingGame,
  buildCountingLeaderboard,
  getCountingSystemChoices,
  getCountingSystemLabel,
  getExpectedCountValue,
} from '../../services/countingGameService.js';
import { logger } from '../../utils/logger.js';

import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
export default {
  data: new SlashCommandBuilder()
    .setName('count')
    .setDescription('管理伺服器數數字遊戲')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('setup')
        .setDescription('在文字頻道中啟動數數字遊戲')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('進行數數字遊戲的頻道')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText),
        )
        .addStringOption((option) =>
          option
            .setName('system')
            .setDescription('要使用的數數字系統')
            .setRequired(true)
            .addChoices(...getCountingSystemChoices()),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('disable').setDescription('停用此伺服器的數數字遊戲'),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('status').setDescription('檢視目前的數數字遊戲狀態'),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('reset')
        .setDescription('重設目前的數數字序列')
        .addIntegerOption((option) =>
          option
            .setName('start')
            .setDescription('重設後開始的數字')
            .setMinValue(1),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('leaderboard').setDescription('顯示數數字遊戲排行榜'),
    ),
  category: 'Fun',

  async execute(interaction) {
    try {
      const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferSuccess) {
        logger.warn('Count 指令 defer 失敗', { userId: interaction.user.id, guildId: interaction.guildId });
        return;
      }

      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: '你需要 **管理伺服器** 權限才能使用此指令。' });
      }

      const guildId = interaction.guildId;
      const subcommand = interaction.options.getSubcommand();
      const config = await getCountingGameConfig(interaction.client, guildId);

      if (subcommand === 'setup') {
        const channel = interaction.options.getChannel('channel');
        const system = interaction.options.getString('system');
        if (!channel || channel.type !== ChannelType.GuildText) {
          return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: '請為數數字遊戲選擇一個文字頻道。' });
        }

        if (config.enabled && config.channelId && config.channelId !== channel.id) {
          return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `此伺服器已經設定了一個活躍的數數字頻道：<#${config.channelId}>。請先停用目前的數數字遊戲，或使用該現有頻道。` });
        }

        await activateCountingGame(interaction.client, guildId, channel.id, system);
        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            successEmbed(
              '已啟用數數字遊戲',
              `數數字遊戲現已在 ${channel} 中啟用，使用 **${getCountingSystemLabel(system)}** 系統。玩家必須從 **1** 開始往上數，且不能連續發送兩個數字。`,
            ),
          ],
        });
      }

      if (subcommand === 'disable') {
        if (!config.enabled) {
          return await InteractionHelper.safeEditReply(interaction, {
            embeds: [infoEmbed('數數字遊戲已停用', '此伺服器的數數字遊戲已經處於停用狀態。')],
          });
        }

        await disableCountingGame(interaction.client, guildId);
        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [successEmbed('數數字遊戲已停用', '數數字遊戲已被停用。')],
        });
      }

      if (subcommand === 'status') {
        const fields = [
          { name: '已啟用', value: config.enabled ? '是' : '否', inline: true },
          { name: '頻道', value: config.channelId ? `<#${config.channelId}>` : '未設定', inline: true },
          { name: '系統', value: getCountingSystemLabel(config.system), inline: true },
          { name: '下一個數字', value: getExpectedCountValue(config), inline: true },
          { name: '目前連續計數', value: `${config.currentStreak}`, inline: true },
          { name: '最佳連續紀錄', value: `${config.bestStreak || 0}`, inline: true },
          { name: '最後計數者', value: config.lastUserId ? `<@${config.lastUserId}>` : '無', inline: true },
        ];

        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            createEmbed({
              title: '數數字遊戲狀態',
              description: '目前設定的數數字遊戲總覽。',
              fields,
              color: 'primary',
            }),
          ],
        });
      }

      if (subcommand === 'reset') {
        if (!config.enabled) {
          return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: '請先使用 `/count setup` 啟用數數字遊戲。' });
        }

        const startNumber = interaction.options.getInteger('start') || 1;
        await resetCountingGame(interaction.client, guildId, startNumber);

        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            successEmbed(
              '數數字遊戲已重設',
              `數數字序列已被重設。請在 <#${config.channelId}> 從 **${startNumber}** 重新開始。`,
            ),
          ],
        });
      }

      if (subcommand === 'leaderboard') {
        const leaderboard = buildCountingLeaderboard(config, interaction.guild);

        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            createEmbed({
              title: '數數字遊戲排行榜',
              description: leaderboard.length > 0 ? leaderboard.join('\n') : '尚未記錄任何計數。',
              color: 'primary',
            }),
          ],
        });
      }

      return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: '請選擇一個有效的數數字遊戲動作。' });
    } catch (error) {
      logger.error('Count 指令發生錯誤：', error);
      return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: '管理數數字遊戲時發生錯誤。' });
    }
  },
};
