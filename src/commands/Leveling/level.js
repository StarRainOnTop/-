import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getLevelingConfig, saveLevelingConfig } from '../../services/leveling/leveling.js';
import { botHasPermission } from '../../utils/permissionGuard.js';
import { TitanBotError, ErrorTypes, replyUserError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import levelDashboard from './modules/level_dashboard.js';

export default {
    data: new SlashCommandBuilder()
        .setName('level')
        .setDescription('管理伺服器等級系統')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addSubcommand((subcommand) =>
            subcommand
                .setName('setup')
                .setDescription('設定等級系統 — 這也會同時啟用它')
                .addChannelOption((option) =>
                    option
                        .setName('channel')
                        .setDescription('要發送升等通知的頻道')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true),
                )
                .addIntegerOption((option) =>
                    option
                        .setName('xp_min')
                        .setDescription('每則訊息獲得的最小經驗值 (預設: 15)')
                        .setMinValue(1)
                        .setMaxValue(500)
                        .setRequired(false),
                )
                .addIntegerOption((option) =>
                    option
                        .setName('xp_max')
                        .setDescription('每則訊息獲得的最大經驗值 (預設: 25)')
                        .setMinValue(1)
                        .setMaxValue(500)
                        .setRequired(false),
                )
                .addStringOption((option) =>
                    option
                        .setName('message')
                        .setDescription(
                            '升等訊息。可使用 {user} 與 {level} 作為變數 (有預設值)',
                        )
                        .setMaxLength(500)
                        .setRequired(false),
                )
                .addIntegerOption((option) =>
                    option
                        .setName('xp_cooldown')
                        .setDescription('每位使用者獲得經驗值的冷卻秒數 (預設: 60)')
                        .setMinValue(0)
                        .setMaxValue(3600)
                        .setRequired(false),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('dashboard')
                .setDescription('開啟互動式等級系統控制面板'),
        ),
    category: 'Leveling',

    async execute(interaction, config, client) {
        const deferred = await InteractionHelper.safeDefer(interaction, {
            flags: MessageFlags.Ephemeral,
        });
        if (!deferred) return;

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: '你需要 **管理伺服器 (Manage Server)** 權限才能使用此指令。' });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'dashboard') {
            return levelDashboard.execute(interaction, config, client);
        }

        if (subcommand === 'setup') {
            const channel = interaction.options.getChannel('channel');
            const xpMin = interaction.options.getInteger('xp_min') ?? 15;
            const xpMax = interaction.options.getInteger('xp_max') ?? 25;
            const message =
                interaction.options.getString('message') ??
                '{user} 已經升級到等級 {level} 了！';
            const xpCooldown = interaction.options.getInteger('xp_cooldown') ?? 60;

            if (xpMin > xpMax) {
                return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: `最小經驗值 (**${xpMin}**) 不能大於最大經驗值 (**${xpMax}**)。` });
            }

            if (!botHasPermission(channel, ['SendMessages', 'EmbedLinks'])) {
                throw new TitanBotError(
                    'Bot missing permissions in the specified channel',
                    ErrorTypes.PERMISSION,
                    `我需要在 ${channel} 中擁有 **發送訊息 (SendMessages)** 與 **嵌入連結 (EmbedLinks)** 權限才能發送升等通知。`,
                );
            }

            const existingConfig = await getLevelingConfig(client, interaction.guildId);

            if (existingConfig.configured) {
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `此伺服器已經設定過等級系統了（升等通知頻道為 <#${existingConfig.levelUpChannel}>）。\n\n請使用 \`/level dashboard\` 來調整任何設定。` });
            }

            const newConfig = {
                ...existingConfig,
                configured: true,
                enabled: true,
                levelUpChannel: channel.id,
                xpRange: { min: xpMin, max: xpMax },
                xpCooldown: xpCooldown,
                levelUpMessage: message,
                announceLevelUp: true,
            };

            await saveLevelingConfig(client, interaction.guildId, newConfig);

            logger.info(`Leveling system set up in guild ${interaction.guildId}`, {
                channelId: channel.id,
                xpMin,
                xpMax,
                xpCooldown,
                userId: interaction.user.id,
            });

            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    createEmbed({
                        title: '等級系統設定完成',
                        description:
                            `等級系統現已**啟用**並準備就緒。\n\n` +
                            `**升等通知頻道：** ${channel}\n` +
                            `**每則訊息經驗值：** ${xpMin} – ${xpMax}\n` +
                            `**經驗值冷卻時間：** ${xpCooldown} 秒\n` +
                            `**升等廣播訊息：** \`${message}\`\n\n` +
                            `你隨時可以使用 \`/level dashboard\` 來調整這些設定。`,
                        color: 'success',
                    }),
                ],
            });
        }
    },
};
