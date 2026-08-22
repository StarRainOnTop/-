import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

import dashboard from './modules/logging_dashboard.js';
import channel from './modules/logging_channel.js';

import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
export default {
    data: new SlashCommandBuilder()
        .setName('logging')
        .setDescription('管理伺服器日誌記錄 — 頻道、過濾器與事件分類。')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addSubcommand((subcommand) =>
            subcommand
                .setName('dashboard')
                .setDescription('開啟日誌記錄控制面板 — 設定頻道、過濾器並切換分類。'),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('channel')
                .setDescription('無需開啟控制面板，快速設定日誌頻道。')
                .addStringOption((option) =>
                    option
                        .setName('destination')
                        .setDescription('要設定的日誌目的地。')
                        .setRequired(true)
                        .addChoices(
                            { name: '審核 (moderation、訊息、成員…)', value: 'audit' },
                            { name: '申請 (Applications)', value: 'applications' },
                            { name: '舉報 (Reports)', value: 'reports' },
                        ),
                )
                .addChannelOption((option) =>
                    option
                        .setName('channel')
                        .setDescription('用於接收日誌的文字頻道。')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false),
                )
                .addBooleanOption((option) =>
                    option
                        .setName('disable')
                        .setDescription('設定為「是」(True) 以清除此日誌頻道。')
                        .setRequired(false),
                ),
        ),

    async execute(interaction, config, client) {
        try {
            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'dashboard') {
                return await dashboard.execute(interaction, config, client);
            }

            if (subcommand === 'channel') {
                return await channel.execute(interaction, config, client);
            }

            await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: '無法識別此子指令。' });
        } catch (error) {
            logger.error('logging command error:', error);
            await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: '發生了未預期的錯誤。' }).catch(() => {});
        }
    },
};
