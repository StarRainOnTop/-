import { EmbedBuilder, MessageFlags, PermissionsBitField } from 'discord.js';
import { getColor } from '../../../config/bot.js';
import { getGuildConfig } from '../../../services/config/guildConfig.js';
import { getLoggingStatus } from '../../../services/loggingService.js';
import {
  createLoggingDashboardComponents,
  createLoggingCategoryViewComponents,
  createLoggingFilterComponents,
  DASHBOARD_CATEGORIES,
  DASHBOARD_CATEGORY_LABELS,
  EVENT_TYPES_BY_CATEGORY,
} from '../../../utils/logging/loggingUi.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
export function getCategoryStatus(enabledEvents, category, auditEnabled) {
  if (!auditEnabled) return false;
  const events = enabledEvents || {};
  if (events[`${category}.*`] === false) return false;
  const categoryEvents = EVENT_TYPES_BY_CATEGORY[category] || [];
  if (categoryEvents.length === 0) return true;
  return categoryEvents.every((eventType) => events[eventType] !== false);
}

async function formatChannelMention(guild, id) {
  if (!id) return '`未設定`';
  const channel = guild.channels.cache.get(id) ?? await guild.channels.fetch(id).catch(() => null);
  return channel ? channel.toString() : `⚠️ 找不到頻道 (${id})`;
}

function countEnabledCategories(enabledEvents, auditEnabled) {
  const enabled = DASHBOARD_CATEGORIES.filter((key) =>
    getCategoryStatus(enabledEvents, key, auditEnabled),
  ).length;
  return { enabled, total: DASHBOARD_CATEGORIES.length };
}

export async function buildLoggingDashboardView(interaction, client) {
  const guildConfig = await getGuildConfig(client, interaction.guildId);
  const loggingStatus = await getLoggingStatus(client, interaction.guildId);

  const auditEnabled = Boolean(loggingStatus.enabled);
  const channels = loggingStatus.channels || {};

  const auditChannel = await formatChannelMention(interaction.guild, channels.audit);
  const applicationsChannel = await formatChannelMention(interaction.guild, channels.applications);
  const reportsChannel = await formatChannelMention(interaction.guild, channels.reports);
  const lifecycleChannel = await formatChannelMention(interaction.guild, guildConfig.ticketLogsChannelId);
  const transcriptChannel = await formatChannelMention(interaction.guild, guildConfig.ticketTranscriptChannelId);

  const ignore = loggingStatus.ignore || { users: [], channels: [] };
  const { enabled: enabledCount, total } = countEnabledCategories(loggingStatus.enabledEvents, auditEnabled);

  const embed = new EmbedBuilder()
    .setTitle('📝 日誌記錄控制面板')
    .setDescription(`管理 **${interaction.guild.name}** 的伺服器日誌記錄。請使用下方的選單來設定頻道、事件分類與過濾器。`)
    .setColor(auditEnabled ? getColor('success') : getColor('warning'))
    .addFields(
      {
        name: '日誌系統狀態',
        value: auditEnabled ? '✅ 已啟用' : '❌ 已停用',
        inline: true,
      },
      {
        name: '事件分類',
        value: auditEnabled ? `已啟用 ${enabledCount}/${total} 個` : '`日誌系統已停用`',
        inline: true,
      },
      {
        name: '忽略過濾器',
        value: `${ignore.users?.length || 0} 位使用者 · ${ignore.channels?.length || 0} 個頻道`,
        inline: true,
      },
      {
        name: '日誌頻道',
        value: [
          `**審核記錄：** ${auditChannel}`,
          `**申請記錄：** ${applicationsChannel}`,
          `**舉報記錄：** ${reportsChannel}`,
        ].join('\n'),
        inline: false,
      },
      {
        name: '客服單頻道（僅供檢視）',
        value: [
          `**客服單日誌：** ${lifecycleChannel}`,
          `**紀錄副本 (Transcript)：** ${transcriptChannel}`,
        ].join('\n'),
        inline: false,
      },
    )
    .setFooter({ text: '客服單頻道：請透過 /ticket dashboard 進行設定' })
    .setTimestamp();

  const components = createLoggingDashboardComponents(loggingStatus.enabledEvents, auditEnabled);
  return { embed, components };
}

export async function buildLoggingCategoriesView(interaction, client) {
  const loggingStatus = await getLoggingStatus(client, interaction.guildId);
  const auditEnabled = Boolean(loggingStatus.enabled);

  const categoryLines = DASHBOARD_CATEGORIES.map((key) => {
    const on = getCategoryStatus(loggingStatus.enabledEvents, key, auditEnabled);
    const label = DASHBOARD_CATEGORY_LABELS[key] || key;
    return `${on ? '✅' : '❌'} ${label}`;
  }).join('\n');

  const embed = new EmbedBuilder()
    .setTitle('📋 事件分類')
    .setDescription(
      auditEnabled
        ? '切換要記錄至審核記錄頻道的事件類型。'
        : '⚠️ 日誌系統目前為停用狀態。請從主控制面板啟用它以發送日誌。',
    )
    .setColor(getColor('info'))
    .addFields({ name: '分類狀態', value: categoryLines, inline: false })
    .setFooter({ text: '綠色 = 記錄中 · 紅色 = 已關閉' })
    .setTimestamp();

  const components = createLoggingCategoryViewComponents(loggingStatus.enabledEvents, auditEnabled);
  return { embed, components };
}

export async function buildLoggingFilterView(interaction, client) {
  const loggingStatus = await getLoggingStatus(client, interaction.guildId);
  const ignore = loggingStatus.ignore || { users: [], channels: [] };

  const userLines = (ignore.users || []).length
    ? ignore.users.map((id) => `• 使用者 \`${id}\``).join('\n')
    : '*無忽略的使用者*';

  const channelLines = (ignore.channels || []).length
    ? ignore.channels.map((id) => `• 頻道 \`${id}\``).join('\n')
    : '*無忽略的頻道*';

  const embed = new EmbedBuilder()
    .setTitle('🔇 日誌忽略過濾器')
    .setDescription('發送審核日誌時，將會跳過此列表中的使用者與頻道。')
    .setColor(getColor('info'))
    .addFields(
      { name: '被忽略的使用者', value: userLines.slice(0, 1024), inline: false },
      { name: '被忽略的頻道', value: channelLines.slice(0, 1024), inline: false },
    )
    .setFooter({ text: '使用下方的按鈕來新增或移除過濾器' })
    .setTimestamp();

  const components = createLoggingFilterComponents();
  return { embed, components };
}

export function isCategoriesView(interaction) {
  return interaction.message?.embeds?.[0]?.title === '📋 事件分類';
}

export function isFilterView(interaction) {
  return interaction.message?.embeds?.[0]?.title === '🔇 日誌忽略過濾器';
}

export async function refreshDashboardMessage(interaction, client) {
  let view;
  if (isCategoriesView(interaction)) {
    view = await buildLoggingCategoriesView(interaction, client);
  } else if (isFilterView(interaction)) {
    view = await buildLoggingFilterView(interaction, client);
  } else {
    view = await buildLoggingDashboardView(interaction, client);
  }

  await interaction.message.edit({
    embeds: [view.embed],
    components: view.components,
    content: null,
  }).catch(() => {});
}

export default {
  prefixOnly: false,
  async execute(interaction, config, client) {
    try {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
        return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: '你需要 **管理伺服器 (Manage Server)** 權限才能檢視日誌記錄控制面板。' });
      }

      await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      const { embed, components } = await buildLoggingDashboardView(interaction, client);
      await InteractionHelper.safeEditReply(interaction, { embeds: [embed], components });
    } catch (error) {
      logger.error('logging_dashboard error:', error);
      await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: '載入日誌記錄控制面板失敗。' });
    }
  },
};
