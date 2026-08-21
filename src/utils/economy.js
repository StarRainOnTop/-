// economy.js

import { getColor, getEconomyKey as getEconomyStorageKey } from './database.js';
import { BotConfig } from '../config/bot.js';
import { normalizeEconomyData } from './schemas.js';
import { logger } from './logger.js';
import { validateDiscordId, validateNumber } from './validation.js';
import { DEFAULT_ECONOMY_DATA } from './constants.js';
import { createError, ErrorTypes, wrapServiceBoundary } from './errorHandler.js';

const ECONOMY_CONFIG = BotConfig.economy || {};
const BASE_BANK_CAPACITY = ECONOMY_CONFIG.baseBankCapacity || 10000;
const BANK_CAPACITY_PER_LEVEL = ECONOMY_CONFIG.bankCapacityPerLevel || 5000;
const DAILY_AMOUNT = ECONOMY_CONFIG.dailyAmount || 100;
const WORK_MIN = ECONOMY_CONFIG.workMin || 10;
const WORK_MAX = ECONOMY_CONFIG.workMax || 100;
const COOLDOWNS = ECONOMY_CONFIG.cooldowns || {
    daily: 24 * 60 * 60 * 1000,
    work: 60 * 60 * 1000,
    crime: 2 * 60 * 60 * 1000,
    rob: 4 * 60 * 60 * 1000,
};

export function getEconomyKey(guildId, userId) {
    const validGuildId = validateDiscordId(guildId, 'guildId');
    const validUserId = validateDiscordId(userId, 'userId');

    if (!validGuildId || !validUserId) {
        throw new Error('無效的 Guild ID 或 User ID');
    }

    return getEconomyStorageKey(validGuildId, validUserId);
}

export function getMaxBankCapacity(userData) {
    if (!userData) return BASE_BANK_CAPACITY;

    const bankLevel = userData.bankLevel || 0;
    let capacity = BASE_BANK_CAPACITY + (bankLevel * BANK_CAPACITY_PER_LEVEL);

    const upgrades = userData.upgrades || {};
    const inventory = userData.inventory || {};

    // 處理銀行升級倍率
    const bankUpgradeLevel = upgrades['bank_upgrade_1'] || upgrades['bank_upgrade'] || 0;
    if (bankUpgradeLevel > 0) {
        capacity = Math.floor(capacity * (1 + (bankUpgradeLevel * 0.5)));
    }

    // 處理道具容量疊加 (例如銀行券)
    const bankNotes = inventory['bank_note'] || 0;
    capacity += (bankNotes * 10000);

    return capacity;
}

export function formatCurrency(amount) {
    const currencyName = ECONOMY_CONFIG.currency?.name || 'coins';
    return `${(amount || 0).toLocaleString()} ${currencyName}`;
}

export async function getEconomyData(client, guildId, userId) {
    try {
        if (!client.db || typeof client.db.get !== 'function') {
            throw new Error('資料庫無法使用');
        }

        const key = getEconomyKey(guildId, userId);
        const data = await client.db.get(key, {});
        const defaults = {
            ...DEFAULT_ECONOMY_DATA,
            wallet: ECONOMY_CONFIG.startingBalance ?? DEFAULT_ECONOMY_DATA?.wallet ?? 1000,
            bank: 0,
            inventory: {},
            upgrades: {},
            shieldExpiresAt: 0,
        };

        return normalizeEconomyData(data, defaults);
    } catch (error) {
        logger.error(`取得使用者 ${userId} 經濟資料時發生錯誤`, error);
        return normalizeEconomyData({}, {
            ...DEFAULT_ECONOMY_DATA,
            wallet: 0,
            bank: 0,
            inventory: {},
            upgrades: {},
            shieldExpiresAt: 0,
        });
    }
}

export async function setEconomyData(client, guildId, userId, data) {
    try {
        if (!client.db || typeof client.db.set !== 'function') {
            throw new Error('資料庫無法使用');
        }

        const key = getEconomyKey(guildId, userId);
        const normalized = normalizeEconomyData(data, DEFAULT_ECONOMY_DATA);
        await client.db.set(key, normalized);
        return true;
    } catch (error) {
        logger.error(`儲存使用者 ${userId} 經濟資料時發生錯誤`, error);
        return false;
    }
}

export async function updateBalance(client, guildId, userId, options = {}) {
    const data = await getEconomyData(client, guildId, userId);

    if (options.wallet !== undefined) {
        data.wallet = Math.max(0, (data.wallet || 0) + options.wallet);
    }

    if (options.bank !== undefined) {
        const maxBank = getMaxBankCapacity(data);
        data.bank = Math.min(Math.max(0, (data.bank || 0) + options.bank), maxBank);
    }

    if (options.xp !== undefined) {
        data.xp = Math.max(0, (data.xp || 0) + options.xp);

        const xpNeeded = Math.floor(5 * Math.pow(data.level || 1, 2) + 50 * (data.level || 1) + 100);
        if (data.xp >= xpNeeded) {
            data.xp -= xpNeeded;
            data.level = (data.level || 1) + 1;
            data.leveledUp = true;
        }
    }

    await setEconomyData(client, guildId, userId, data);
    return data;
}

export function checkCooldown(userData, action) {
    const cooldownTime = COOLDOWNS[action] || 0;
    const actionKey = `last${action.charAt(0).toUpperCase() + action.slice(1)}`;
    const lastUsed = userData ? (userData[actionKey] || 0) : 0;
    const now = Date.now();
    const remaining = Math.max(0, (lastUsed + cooldownTime) - now);

    return {
        onCooldown: remaining > 0,
        remaining,
        formatted: formatCooldown(remaining)
    };
}

function formatCooldown(ms) {
    if (ms <= 0) return '現在';

    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}天 ${hours % 24}小時`;
    if (hours > 0) return `${hours}小時 ${minutes % 60}分`;
    if (minutes > 0) return `${minutes}分 ${seconds % 60}秒`;
    return `${seconds}秒`;
}

export function getWorkReward() {
    const amount = Math.floor(Math.random() * (WORK_MAX - WORK_MIN + 1)) + WORK_MIN;
    const jobs = [
        '在快餐店打工',
        '擔任軟體工程師',
        '在建築工地工作',
        '擔任醫生診察病人',
        '進行實況直播',
        '製作 YouTube 影片',
        '在學校教學',
        '擔任收銀員',
        '送外賣',
        '接案做自由職業'
    ];

    const job = jobs[Math.floor(Math.random() * jobs.length)];

    return {
        amount,
        job,
        message: `你${job}，賺取了 ${formatCurrency(amount)}！`
    };
}

export function getCrimeOutcome() {
    const amountRand = Math.floor(Math.random() * 200) + 50;
    const pickpocketRand = Math.floor(Math.random() * 100) + 20;
    const hackRand = Math.floor(Math.random() * 150) + 30;
    const fineRand1 = Math.floor(Math.random() * 100) + 50;
    const fineRand2 = Math.floor(Math.random() * 150) + 50;

    const outcomes = [
        {
            success: true,
            amount: amountRand,
            message: `你成功搶劫了銀行，帶走了 ${formatCurrency(amountRand)}！`
        },
        {
            success: true,
            amount: pickpocketRand,
            message: `你扒竊了路人，偷到 ${formatCurrency(pickpocketRand)}！`
        },
        {
            success: true,
            amount: hackRand,
            message: `你入侵了銀行帳戶，轉轉移了 ${formatCurrency(hackRand)} 到自己名下！`
        },
        {
            success: false,
            fine: fineRand1,
            message: `你當場被捕，被迫支付了 ${formatCurrency(fineRand1)} 的罰款！`
        },
        {
            success: false,
            fine: fineRand2,
            message: `警察抓到了你！你支付了 ${formatCurrency(fineRand2)} 才保釋出來。`
        },
        {
            success: false,
            fine: 0,
            message: '你的犯罪計畫失敗了，幸好你成功逃脫！'
        }
    ];

    return outcomes[Math.floor(Math.random() * outcomes.length)];
}

export function getRobOutcome(targetBalance) {
    if (targetBalance <= 0) {
        return {
            success: false,
            amount: 0,
            message: '目標身上沒有任何現金可以搶劫！'
        };
    }

    const success = Math.random() > 0.4;

    if (success) {
        const amount = Math.min(
            Math.floor(Math.random() * (targetBalance * 0.3)) + 1,
            targetBalance
        );

        return {
            success: true,
            amount,
            message: `你成功搶劫了對方，搶走 ${formatCurrency(amount)}！`
        };
    } else {
        const fine = Math.floor(Math.random() * 200) + 100;

        return {
            success: false,
            amount: 0,
            fine,
            message: `你搶劫失敗被抓到了！支付了 ${formatCurrency(fine)} 的罰金。`
        };
    }
}

export function formatShopItem(item, index) {
    return `**${index + 1}.** ${item.emoji} **${item.name}** - ${formatCurrency(item.price)}\n${item.description}\n`;
}

export const addMoney = wrapServiceBoundary(async function addMoney(client, guildId, userId, amount, type = 'wallet') {
    const validAmount = validateNumber(amount, 'amount');
    if (validAmount === null || validAmount <= 0) {
        throw createError(
            '金額無效',
            ErrorTypes.VALIDATION,
            '金額必須為正數。',
            { guildId, userId, amount, operation: 'addMoney' }
        );
    }

    if (type !== 'wallet' && type !== 'bank') {
        throw createError(
            '貨幣類型無效',
            ErrorTypes.VALIDATION,
            '類型必須為 "wallet" 或 "bank"。',
            { guildId, userId, type, operation: 'addMoney' }
        );
    }

    const userData = await getEconomyData(client, guildId, userId);

    if (type === 'bank') {
        const maxBank = getMaxBankCapacity(userData);
        if ((userData.bank || 0) + validAmount > maxBank) {
            throw createError(
                '超出銀行容量上限',
                ErrorTypes.VALIDATION,
                `銀行儲存空間不足。目前：${userData.bank || 0}，上限：${maxBank}。`,
                { guildId, userId, current: userData.bank || 0, max: maxBank, operation: 'addMoney' }
            );
        }
        userData.bank = (userData.bank || 0) + validAmount;
    } else {
        userData.wallet = (userData.wallet || 0) + validAmount;
    }

    await setEconomyData(client, guildId, userId, userData);

    return {
        newBalance: type === 'bank' ? userData.bank : userData.wallet,
        ...(type === 'bank' ? { maxBank: getMaxBankCapacity(userData) } : {}),
    };
}, {
    service: 'economy',
    operation: 'addMoney',
    userMessage: '增加金額失敗，請稍後再試。',
});

export const removeMoney = wrapServiceBoundary(async function removeMoney(client, guildId, userId, amount, type = 'wallet') {
    const validAmount = validateNumber(amount, 'amount');
    if (validAmount === null || validAmount <= 0) {
        throw createError(
            '金額無效',
            ErrorTypes.VALIDATION,
            '金額必須為正數。',
            { guildId, userId, amount, operation: 'removeMoney' }
        );
    }

    if (type !== 'wallet' && type !== 'bank') {
        throw createError(
            '貨幣類型無效',
            ErrorTypes.VALIDATION,
            '類型必須為 "wallet" 或 "bank"。',
            { guildId, userId, type, operation: 'removeMoney' }
        );
    }

    const userData = await getEconomyData(client, guildId, userId);

    if (type === 'bank') {
        if ((userData.bank || 0) < validAmount) {
            throw createError(
                '銀行餘額不足',
                ErrorTypes.VALIDATION,
                `銀行帳戶餘額不足。目前餘額：${userData.bank || 0}，需要：${validAmount}。`,
                { guildId, userId, current: userData.bank || 0, required: validAmount, operation: 'removeMoney' }
            );
        }
        userData.bank = (userData.bank || 0) - validAmount;
    } else {
        if ((userData.wallet || 0) < validAmount) {
            throw createError(
                '錢包餘額不足',
                ErrorTypes.VALIDATION,
                `錢包餘額不足。目前餘額：${userData.wallet || 0}，需要：${validAmount}。`,
                { guildId, userId, current: userData.wallet || 0, required: validAmount, operation: 'removeMoney' }
            );
        }
        userData.wallet = (userData.wallet || 0) - validAmount;
    }

    await setEconomyData(client, guildId, userId, userData);

    return {
        newBalance: type === 'bank' ? userData.bank : userData.wallet,
    };
}, {
    service: 'economy',
    operation: 'removeMoney',
    userMessage: '扣除金額失敗，請稍後再試。',
});

export function getShopInventory() {
    return [
        {
            id: 'fishing_rod',
            name: '釣魚竿',
            emoji: '🎣',
            price: 500,
            description: '用來釣魚並出售獲利！',
            type: 'tool'
        },
        {
            id: 'hunting_rifle',
            name: '獵槍',
            emoji: '🔫',
            price: 1000,
            description: '狩獵野生動物以獲取肉類與毛皮！',
            type: 'tool'
        },
        {
            id: 'laptop',
            name: '筆記型電腦',
            emoji: '💻',
            price: 2000,
            description: '以程式設計師身份工作，獲取更高的薪水！',
            type: 'tool',
            workMultiplier: 1.5
        },
        {
            id: 'bank_loan',
            name: '銀行拓展卡',
            emoji: '🏦',
            price: 5000,
            description: '提升你的銀行儲存容量上限 50,000！',
            type: 'upgrade',
            effect: 'bank_capacity',
            value: 50000
        },
        {
            id: 'lottery_ticket',
            name: '彩券',
            emoji: '🎫',
            price: 100,
            description: '買一個贏得大獎的機會！',
            type: 'consumable',
            use: 'gamble'
        }
    ];
}
