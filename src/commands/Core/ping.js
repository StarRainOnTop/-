import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("ping")
        .setDescription("檢查機器人的延遲與 API 速度"),

    async prefixExecute(interaction) {
        try {
            const startTime = Date.now();
            const pingingMessage = await interaction.reply({ content: '正在測量延遲...' });

            const latency = Date.now() - startTime;
            const apiLatency = Math.max(0, Math.round(interaction.client.ws.ping));

            const embed = createEmbed({ title: 'Pong!', description: null }).addFields(
                { name: '機器人延遲', value: `${latency}ms`, inline: true },
                { name: 'API 延遲', value: `${apiLatency}ms`, inline: true },
            );

            await pingingMessage.edit({ content: null, embeds: [embed] });
        } catch (error) {
            logger.error('Ping 前綴指令發生錯誤：', error);
            if (!interaction.replied && !interaction._replyMessage) {
                await interaction.channel.send({
                    embeds: [createEmbed({ title: '系統錯誤', description: '目前無法測定延遲。', color: 'error' })],
                }).catch(() => {});
            }
        }
    },

    async execute(interaction) {
        logger.info('execute 已呼叫 - 正在檢查是斜線指令還是前綴指令');
        logger.info(`execute - 包含 _commandStartTime: ${!!interaction._commandStartTime}，建立時間戳記: ${interaction.createdTimestamp}`);
        
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Ping 互動延遲回覆 (defer) 失敗`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'ping'
            });
            return;
        }

        try {
            await InteractionHelper.safeEditReply(interaction, {
                content: "正在測量延遲...",
            });

            const startTime = interaction._commandStartTime || interaction.createdTimestamp;
            logger.info(`execute - 使用的開始時間: ${startTime}，類型: ${interaction._commandStartTime ? '前綴指令' : '斜線指令'}`);
            const latency = Math.max(0, Date.now() - startTime);
            const apiLatency = Math.max(0, Math.round(interaction.client.ws.ping));
            logger.info(`execute - 計算出的延遲: ${latency}ms，API 延遲: ${apiLatency}ms`);

            const embed = createEmbed({ title: "Pong!", description: null }).addFields(
                { name: "機器人延遲", value: `${latency}ms`, inline: true },
                { name: "API 延遲", value: `${apiLatency}ms`, inline: true },
            );

            await InteractionHelper.safeEditReply(interaction, {
                content: null,
                embeds: [embed],
            });
        } catch (error) {
            logger.error('Ping 指令發生錯誤：', error);
            try {
                return await InteractionHelper.safeReply(interaction, {
                    embeds: [createEmbed({ title: '系統錯誤', description: '目前無法測定延遲。', color: 'error' })],
                    flags: MessageFlags.Ephemeral,
                });
            } catch (replyError) {
                logger.error('發送錯誤回覆失敗：', replyError);
            }
        }
    },
};
