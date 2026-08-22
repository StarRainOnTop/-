import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../services/config/guildConfig.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError, replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

import ticketConfig from './modules/ticket_dashboard.js';

export default {
    data: new SlashCommandBuilder()
        .setName("ticket")
        .setDescription("管理伺服器的客服單系統。")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand((subcommand) =>
            subcommand
                .setName("setup")
                .setDescription(
                    "在指定的頻道中設定客服單建立面板。",
                )
                .addChannelOption((option) =>
                    option
                        .setName("panel_channel")
                        .setDescription(
                            "要發送客服單面板的頻道。",
                        )
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true),
                )

                .addStringOption((option) =>
                    option
                        .setName("panel_message")
                        .setDescription(
                            "客服單面板的主要訊息/說明。",
                        )
                        .setRequired(true),
                )
                .addStringOption((option) =>
                    option
                        .setName("button_label")
                        .setDescription(
                            "客服單建立按鈕的標籤（預設：建立客服單）",
                        )
                        .setRequired(false),
                )
                .addChannelOption((option) =>
                    option
                        .setName("category")
                        .setDescription(
                            "將建立新客服單的分類頻道（選填）。",
                        )
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(false),
                )
                .addChannelOption((option) =>
                    option
                        .setName("closed_category")
                        .setDescription(
                            "將移動已關閉客服單的分類頻道（選填）。",
                        )
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(false),
                )
                .addRoleOption((option) =>
                    option
                        .setName("staff_role")
                        .setDescription(
                            "可以存取客服單的身分組（選填）。",
                        )
                        .setRequired(false),
                )
                .addIntegerOption((option) =>
                    option
                        .setName("max_tickets_per_user")
                        .setDescription("單一用戶可以建立的最大客服單數量（預設：3）")
                        .setMinValue(1)
                        .setMaxValue(10)
                        .setRequired(false),
                )
                .addBooleanOption((option) =>
                    option
                        .setName("dm_on_close")
                        .setDescription("當客服單關閉時發送私人訊息給用戶（預設：true）")
                        .setRequired(false),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("dashboard")
                .setDescription("開啟互動式客服單系統儀表板"),
        ),
    category: "ticket",

    async execute(interaction, config, client) {
        const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferred) {
            return;
        }

        if (
            !interaction.member.permissions.has(
                PermissionFlagsBits.ManageChannels,
            )
        ) {
            logger.warn('Ticket command permission denied', {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'ticket'
            });
            return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: '您需要「管理頻道」權限才能執行此動作。' });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === "dashboard") {
            return ticketConfig.execute(interaction, config, client);
        }

        if (subcommand === "setup") {
            const existingConfig = await getGuildConfig(client, interaction.guildId);
            if (existingConfig?.ticketPanelChannelId) {
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `此伺服器已經設定過客服單系統（面板位於 <#${existingConfig.ticketPanelChannelId}>）。\n\n每個伺服器僅支援一個客服單系統。請使用 \`/ticket dashboard\` 來編輯或更新現有設定，或從儀表板中選擇 **刪除系統** 來移除它並重新開始。` });
            }

            const panelChannel =
                interaction.options.getChannel("panel_channel");
            const categoryChannel = interaction.options.getChannel("category");
            const closedCategoryChannel = interaction.options.getChannel("closed_category");
            const staffRole = interaction.options.getRole("staff_role");
            const panelMessage = interaction.options.getString("panel_message") || "點擊下方的按鈕以建立支援客服單。";
            const buttonLabel =
                interaction.options.getString("button_label") ||
                "建立客服單";
            const maxTicketsPerUser = interaction.options.getInteger("max_tickets_per_user") || 3;
            const dmOnClose = interaction.options.getBoolean("dm_on_close") !== false;

            const setupEmbed = createEmbed({ 
                title: "支援客服單", 
                description: panelMessage,
                color: getColor('info')
            });

            const ticketButton = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("create_ticket")
                    .setLabel(buttonLabel)
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji("📩"),
            );

            try {
                const sentPanel = await panelChannel.send({
                    embeds: [setupEmbed],
                    components: [ticketButton],
                });

                if (client.db && interaction.guildId) {
                    const currentConfig = existingConfig;
                    currentConfig.ticketCategoryId = categoryChannel ? categoryChannel.id : null;
                    currentConfig.ticketClosedCategoryId = closedCategoryChannel ? closedCategoryChannel.id : null;
                    currentConfig.ticketStaffRoleId = staffRole ? staffRole.id : null;
                    currentConfig.ticketPanelChannelId = panelChannel.id;
                    currentConfig.ticketPanelMessageId = sentPanel?.id || null;
                    currentConfig.ticketPanelMessage = panelMessage;
                    currentConfig.ticketButtonLabel = buttonLabel;
                    currentConfig.maxTicketsPerUser = maxTicketsPerUser;
                    currentConfig.dmOnClose = dmOnClose;

                    await setGuildConfig(client, interaction.guildId, currentConfig);
                    logger.info('Ticket configuration saved', {
                        guildId: interaction.guildId,
                        categoryId: categoryChannel?.id,
                        closedCategoryId: closedCategoryChannel?.id,
                        staffRoleId: staffRole?.id,
                        maxTickets: maxTicketsPerUser,
                        dmOnClose: dmOnClose,
                    });
                } else {
                    logger.error('Ticket setup: database unavailable, panel sent but configuration was NOT saved', {
                        guildId: interaction.guildId,
                    });
                }

                let successMessage = `客服單建立面板已發送至 ${panelChannel}。`;
                
                if (categoryChannel) {
                    successMessage += `新客服單將會在 **${categoryChannel.name}** 分類中建立。`;
                } else {
                    successMessage += '新客服單將會在新的「Tickets」分類中建立。';
                }
                
                if (closedCategoryChannel) {
                    successMessage += `已關閉的客服單將會移動至 **${closedCategoryChannel.name}**。`;
                }
                
                if (staffRole) {
                    successMessage += `**${staffRole.name}** 身分組將擁有存取客服單的權限。`;
                }
                
                successMessage += `\n\n**每位用戶最大客服單數：** ${maxTicketsPerUser}\n**關閉時私訊：** ${dmOnClose ? '已啟用' : '已停用'}`;

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        successEmbed(
                            "已設定客服單面板",
                            successMessage,
                        ),
                    ],
                });

                logger.info('Ticket panel setup completed', {
                    userId: interaction.user.id,
                    userTag: interaction.user.tag,
                    guildId: interaction.guildId,
                    panelChannelId: panelChannel.id,
                    categoryId: categoryChannel?.id,
                    closedCategoryId: closedCategoryChannel?.id,
                    staffRoleId: staffRole?.id,
                    maxTickets: maxTicketsPerUser,
                    dmOnClose: dmOnClose,
                    commandName: 'ticket_setup'
                });

                const logEmbed = createEmbed({
                    title: "客服單系統設定 (設定記錄)",
                    description: `客服單面板由 ${interaction.user} 設定於 ${panelChannel}。`,
                    color: getColor('warning')
                })
                    .addFields(
                        {
                            name: "面板頻道",
                            value: panelChannel.toString(),
                            inline: true,
                        },
                        {
                            name: "客服單分類",
                            value: categoryChannel
                                ? categoryChannel.toString()
                                : "未指定。",
                            inline: true,
                        },
                        {
                            name: "關閉分類",
                            value: closedCategoryChannel
                                ? closedCategoryChannel.toString()
                                : "未指定。",
                            inline: true,
                        },
                        {
                            name: "客服人員身分組",
                            value: staffRole
                                ? staffRole.toString()
                                : "未指定。",
                            inline: true,
                        },
                        {
                            name: "每位用戶最大客服單數",
                            value: maxTicketsPerUser.toString(),
                            inline: true,
                        },
                        {
                            name: "關閉時私訊",
                            value: dmOnClose ? '已啟用' : '已停用',
                            inline: true,
                        },
                        {
                            name: "管理者",
                            value: `${interaction.user.tag} (${interaction.user.id})`,
                            inline: false,
                        },
                    );

            } catch (error) {
                logger.error('Ticket setup error', {
                    error: error.message,
                    stack: error.stack,
                    userId: interaction.user.id,
                    guildId: interaction.guildId,
                    commandName: 'ticket_setup'
                });
                if (interaction.deferred || interaction.replied) {
                    await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: '無法發送客服單面板或儲存設定。請檢查機器人的權限（特別是在目標頻道發送訊息的權限）以及資料庫連線。' }).catch(err => {
                        logger.error('Failed to send error reply', {
                            error: err.message,
                            guildId: interaction.guildId
                        });
                    });
                } else {
                    await handleInteractionError(interaction, error, {
                        commandName: 'ticket_setup',
                        source: 'ticket_setup_command'
                    });
                }
            }
        }
    }
};
