import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, MessageFlags } from 'discord.js';
import { getWelcomeConfig, updateWelcomeConfig } from '../../utils/database.js';
import { formatWelcomeMessage, truncateForEmbedField } from '../../utils/welcome.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { ErrorTypes, replyUserError } from '../../utils/errorHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('goodbye')
        .setDescription('設定離開（歡送）訊息系統')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('設定離開訊息')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('要發送離開訊息的頻道')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('message')
                        .setDescription('離開訊息。變數：{user}, {username}, {server}, {memberCount}')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('image')
                        .setDescription('要包含在離開訊息中的圖片網址')
                        .setRequired(false))
                .addBooleanOption(option =>
                    option.setName('ping')
                        .setDescription('是否要在離開訊息中標註（ping）該用戶')
                        .setRequired(false))),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Goodbye 互動延遲 (defer) 失敗`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'goodbye'
            });
            return;
        }

        const { options, guild, client } = interaction;

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: '你需要**管理伺服器 (Manage Server)** 權限才能使用 `/goodbye`。' });
        }

        const subcommand = options.getSubcommand();

        if (subcommand === 'setup') {
            const channel = options.getChannel('channel');
            const message = options.getString('message');
            const image = options.getString('image');
            const ping = options.getBoolean('ping') ?? false;

            const existingConfig = await getWelcomeConfig(client, guild.id);
            if (existingConfig?.goodbyeChannelId) {
                logger.info(`[Goodbye] 伺服器 ${guild.id} 的頻道 ${existingConfig.goodbyeChannelId} 已經存在設定，故阻擋此次設定`);
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `離開訊息已經設定在 <#${existingConfig.goodbyeChannelId}>。請使用 **/greet dashboard** 來客製化頻道、訊息、標註或圖片。` });
            }

            if (!message || message.trim().length === 0) {
                logger.warn(`[Goodbye] 用戶 ${interaction.user.tag} 在 ${guild.name} 提供了空白的訊息`);
                return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: '離開訊息不能為空' });
            }

            if (image) {
                try {
                    new URL(image);
                } catch (e) {
                    logger.warn(`[Goodbye] 用戶 ${interaction.user.tag} 提供了無效的圖片網址：${image}`);
                    return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: '請提供有效的圖片網址（必須以 http:// 或 https:// 開頭）' });
                }
            }

            try {
                await updateWelcomeConfig(client, guild.id, {
                    goodbyeEnabled: true,
                    goodbyeChannelId: channel.id,
                    leaveMessage: message,
                    goodbyePing: ping,
                    leaveEmbed: {
                        title: "Goodbye {user.tag}",
                        description: message,
                        color: getColor('error'),
                        footer: `Goodbye from ${guild.name}!`,
                        ...(image && { image: { url: image } })
                    }
                });

                logger.info(`[Goodbye] 用戶 ${interaction.user.tag} 已為伺服器 ${guild.name} (${guild.id}) 完成設定`);

                const previewMessage = formatWelcomeMessage(message, {
                    user: interaction.user,
                    guild
                });

                const embed = new EmbedBuilder()
                    .setColor(getColor('success'))
                    .setTitle('已設定離開訊息系統')
                    .setDescription(`離開訊息現在將會發送到 ${channel}`)
                    .addFields(
                        { name: '訊息預覽', value: truncateForEmbedField(previewMessage) },
                        { name: '標註用戶', value: ping ? '是' : '否' },
                        { name: '狀態', value: '已啟用' }
                    )
                    .setFooter({ text: '提示：使用 /greet dashboard 來進一步客製化離開訊息設定' });

                if (image) {
                    embed.setImage(image);
                }

                await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            } catch (error) {
                logger.error(`[Goodbye] 為伺服器 ${guild.id} 設定離開訊息系統失敗：`, error);
                await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: '設定離開訊息系統時發生錯誤，請稍後再試。' });
            }
        }
    },
};
