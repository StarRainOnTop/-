import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const CRIME_COOLDOWN = 30 * 60 * 1000;
const JAIL_TIME = 1 * 60 * 60 * 1000;
const FINE_RATE = 0.2;

const CRIME_TYPES = [
    { name: "Pickpocketing", min: 100, max: 500, risk: 0.3 },
    { name: "Burglary", min: 300, max: 1000, risk: 0.4 },
    { name: "Bank Heist", min: 1000, max: 5000, risk: 0.6 },
    { name: "Art Theft", min: 2000, max: 10000, risk: 0.7 },
    { name: "Cybercrime", min: 5000, max: 20000, risk: 0.8 },
];

export default {
    data: new SlashCommandBuilder()
        .setName('crime')
        .setDescription('犯罪來賺取金錢（有風險）')
        .addStringOption(option =>
            option
                .setName('type')
                .setDescription('要犯案的類型')
                .setRequired(true)
                .addChoices(
                    { name: '扒竊 (Pickpocketing)', value: 'pickpocketing' },
                    { name: '闖空門 (Burglary)', value: 'burglary' },
                    { name: '銀行搶劫 (Bank Heist)', value: 'bank-heist' },
                    { name: '藝術品偷竊 (Art Theft)', value: 'art-theft' },
                    { name: '網路犯罪 (Cybercrime)', value: 'cybercrime' },
                )
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        await InteractionHelper.safeDefer(interaction);
            
            const userId = interaction.user.id;
            const guildId = interaction.guildId;
            const now = Date.now();

            const userData = await getEconomyData(client, guildId, userId);
            const lastCrime = userData.cooldowns?.crime || 0;
            const isJailed = userData.jailedUntil && userData.jailedUntil > now;

            if (isJailed) {
                const timeLeft = Math.ceil((userData.jailedUntil - now) / (1000 * 60));
                throw createError(
                    "User is in jail",
                    ErrorTypes.RATE_LIMIT,
                    `你還要在監獄裡待 ${timeLeft} 分鐘！`,
                    { jailTimeRemaining: userData.jailedUntil - now }
                );
            }

            if (now < lastCrime + CRIME_COOLDOWN) {
                const timeLeft = Math.ceil((lastCrime + CRIME_COOLDOWN - now) / (1000 * 60));
                throw createError(
                    "Crime cooldown active",
                    ErrorTypes.RATE_LIMIT,
                    `你必須等待 ${timeLeft} 分鐘後才能再次犯案。`,
                    { remaining: lastCrime + CRIME_COOLDOWN - now, cooldownType: 'crime' }
                );
            }

            const crimeType = interaction.options.getString("type").toLowerCase();
            const crime = CRIME_TYPES.find(
                c => c.name.toLowerCase().replace(/\s+/g, '-') === crimeType
            );

            if (!crime) {
                throw createError(
                    "Invalid crime type",
                    ErrorTypes.VALIDATION,
                    "請選擇一個有效的犯罪類型。",
                    { crimeType }
                );
            }

            const isSuccess = Math.random() > crime.risk;
            const amountEarned = isSuccess
                ? Math.floor(Math.random() * (crime.max - crime.min + 1)) + crime.min
                : 0;

            userData.cooldowns = userData.cooldowns || {};
            userData.cooldowns.crime = now;

            if (isSuccess) {
                userData.wallet = (userData.wallet || 0) + amountEarned;
                
                await setEconomyData(client, guildId, userId, userData);
                
                const embed = successEmbed(
                    "🕵️ 犯罪成功！",
                    `你成功進行了 **${crime.name}**，賺取了 **$${amountEarned.toLocaleString()}**！`
                );
                
                await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            } else {
                // 罰款根據嘗試犯罪的潛在收穫計算
                const potentialHaul = Math.floor((crime.min + crime.max) / 2);
                const fine = Math.min(Math.floor(potentialHaul * FINE_RATE), userData.wallet || 0);
                userData.wallet = Math.max(0, (userData.wallet || 0) - fine);
                userData.jailedUntil = now + JAIL_TIME;
                
                await setEconomyData(client, guildId, userId, userData);
                
                const embed = warningEmbed(
                    "🚔 犯罪失敗！",
                    `你在嘗試 **${crime.name}** 時被抓包並送進了監獄！` +
                    `你被罰款 **$${fine.toLocaleString()}** 且必須在監獄裡待上 2 小時。`
                );
                
                await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            }
    }, { command: 'crime' })
};
