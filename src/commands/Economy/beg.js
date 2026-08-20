import { SlashCommandBuilder } from 'discord.js';
import { successEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { botConfig } from '../../config/bot.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const COOLDOWN = 15 * 60 * 1000;
const MIN_WIN = Number(botConfig?.economy?.begMin) || 50;
const MAX_WIN = Number(botConfig?.economy?.begMax) || 200;
const SUCCESS_CHANCE = 0.7;

export default {
    data: new SlashCommandBuilder()
        .setName('beg')
        .setDescription('乞討一小筆金額'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
            
            const userId = interaction.user.id;
            const guildId = interaction.guildId;

            let userData = await getEconomyData(client, guildId, userId);
            
            if (!userData) {
                throw createError(
                    "Failed to load economy data",
                    ErrorTypes.DATABASE,
                    "無法載入您的經濟數據，請稍後再試。",
                    { userId, guildId }
                );
            }

            const lastBeg = userData.lastBeg || 0;
            const remainingTime = lastBeg + COOLDOWN - Date.now();

            if (remainingTime > 0) {
                const minutes = Math.floor(remainingTime / 60000);
                const seconds = Math.floor((remainingTime % 60000) / 1000);

                let timeMessage =
                    minutes > 0 ? `${minutes} 分鐘` : `${seconds} 秒`;

                throw createError(
                    "Beg cooldown active",
                    ErrorTypes.RATE_LIMIT,
                    `你還沒休息夠呢！請在 **${timeMessage}** 後再試。`,
                    { remainingTime, minutes, seconds, cooldownType: 'beg' }
                );
            }

            const success = Math.random() < SUCCESS_CHANCE;

            let replyEmbed;
            let newCash = userData.wallet;

            if (success) {
                const amountWon =
                    Math.floor(Math.random() * (MAX_WIN - MIN_WIN + 1)) + MIN_WIN;

                newCash += amountWon;

                const successMessages = [
                    // 原有 4 種
                    `一位好心的陌生人往你的杯子裡投了 **$${amountWon.toLocaleString()}**。`,
                    `你發現了一個沒人注意的錢包！你抓起 **$${amountWon.toLocaleString()}** 然後立刻逃跑。`,
                    `有人對你心生憐憫，給了你 **$${amountWon.toLocaleString()}**！`,
                    `你在公園長椅底下找到了 **$${amountWon.toLocaleString()}**。`,
                    // 新增 10 種
                    `一個路過的富豪覺得你的招牌很好笑，豪氣地塞給了你 **$${amountWon.toLocaleString()}**！`,
                    `你在路上撿到了一張掉落的彩券，兌獎竟然中了 **$${amountWon.toLocaleString()}**！`,
                    `一位好心的小姐姐把你當成街頭藝人，打賞了你 **$${amountWon.toLocaleString()}**。`,
                    `你幫路人撿起掉落的帽子，對方為了道謝給了你 **$${amountWon.toLocaleString()}**。`,
                    `你在販賣機的退幣口意外掏出了 **$${amountWon.toLocaleString()}** 的零錢！`,
                    `一位實況主剛好在附近拍片，順手塞給你 **$${amountWon.toLocaleString()}** 當作臨時臨演費。`,
                    `你在垃圾桶旁邊意外翻到了一個裝有 **$${amountWon.toLocaleString()}** 的舊紅包袋！`,
                    `你即興在路邊唱了一首歌，獲得了路人熱烈的掌聲與 **$${amountWon.toLocaleString()}** 打賞。`,
                    `一隻可愛的小狗叼著一張鈔票走到你面前，你順勢收下了 **$${amountWon.toLocaleString()}**。`,
                    `慈悲的老奶奶看你可憐，不僅給了你熱湯，還塞了 **$${amountWon.toLocaleString()}** 給你。`
                ];

                replyEmbed = successEmbed(
                    '乞討成功',
                    successMessages[
                        Math.floor(Math.random() * successMessages.length)
                    ]
                );
            } else {
                const failMessages = [
                    // 原有 4 種
                    "警察把你趕走了，你什麼也沒有得到。",
                    "有人大喊：「去找個工作吧！」然後從你身邊走了過去。",
                    "一隻松鼠偷走了你身上僅存的一枚硬幣。",
                    "你試著開口乞討，但覺得太尷尬便放棄了。",
                    // 新增 10 種
                    "路人不僅沒理你，還順便塞了一張求職傳單給你。",
                    "你才剛坐下，天空就下起暴雨，只好狼狽地逃走。",
                    "一個路人經過你身邊時，大喊了一聲詐騙集團，嚇得大家紛紛走避。",
                    "城管巡邏經過，直接把你的紙板和杯子沒收了！",
                    "你開口要錢，結果遇到比你更窮的人反過來向你借錢。",
                    "你剛伸出手，一隻鴿子精準地在你手上拉了一坨鳥屎，你只好摸摸鼻子離開。",
                    "有一個怪人突然蹲下來對你講了兩小時的人生大道理，什麼錢也沒拿到。",
                    "你挑錯了地方，結果被地盤保全狠狠訓斥了一頓。",
                    "正要開口時，你的熟人剛好路過，你尷尬得立刻把頭埋進外套裡裝死。",
                    "你面前的零錢碗突然被一陣強風吹翻，硬幣全滾進了旁邊的水溝孔裡。"
                ];

                replyEmbed = warningEmbed(
                    '乞討失敗',
                    failMessages[Math.floor(Math.random() * failMessages.length)]
                );
            }

            userData.wallet = newCash;
            userData.lastBeg = Date.now();

            await setEconomyData(client, guildId, userId, userData);

            await InteractionHelper.safeEditReply(interaction, { embeds: [replyEmbed] });
    }, { command: 'beg' })
};
