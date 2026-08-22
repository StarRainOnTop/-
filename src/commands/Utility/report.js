import { SlashCommandBuilder, ChannelType } from 'discord.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

import report from './modules/report.js';
import reportSetchannel from './modules/report_setchannel.js';

export default {
    data: new SlashCommandBuilder()
        .setName('report')
        .setDescription('檢舉伺服器成員給工作人員，或設定接收檢舉的頻道。')
        .setDMPermission(false)
        .addSubcommand(subcommand =>
            subcommand
                .setName('file')
                .setDescription('檢舉伺服器管理團隊的成員。')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('你想檢舉的使用者。')
                        .setRequired(true),
                )
                .addStringOption(option =>
                    option
                        .setName('reason')
                        .setDescription('檢舉的原因 (請詳細說明)。')
                        .setRequired(true)
                        .setMaxLength(500),
                ),
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('setchannel')
                .setDescription('設定接收使用者檢舉的頻道。(需要管理伺服器權限)')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('接收檢舉的文字頻道。')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true),
                ),
        ),
    category: '工具',

    async execute(interaction, config, client) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'file') {
            return await report.execute(interaction, config, client);
        }

        if (subcommand === 'setchannel') {
            return await reportSetchannel.execute(interaction, config, client);
        }

        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: '未知的子指令。' });
    },
};
