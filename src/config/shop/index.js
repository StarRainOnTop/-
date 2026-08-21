import { shopItems, getItemById, getItemsByType, getItemPrice, validatePurchase } from './items.js';
import { botConfig } from '../bot.js';

const { currency } = botConfig.economy;

export const shopConfig = {
    name: '星雨機器人商店',
    currency: currency.name,
    currencyName: currency.name,
    currencyNamePlural: currency.namePlural || `${currency.name}s`,
    currencySymbol: currency.symbol || '💵',
    
    categories: [
        {
            id: 'consumables',
            name: '消耗品',
            description: '提供臨時增益效果的一性次使用道具',
            icon: '🍯',
            itemTypes: ['consumable']
        },
        {
            id: 'upgrades',
            name: '升級道具',
            description: '永久提升你能力的強化道具',
            icon: '⚡',
            itemTypes: ['upgrade']
        },
        {
            id: 'tools',
            name: '工具設備',
            description: '幫助你更有效率採集資源的裝備',
            icon: '⛏️',
            itemTypes: ['tool']
        },
        {
            id: 'roles',
            name: '身分組',
            description: '具有獨特特權的特殊身分組',
            icon: '🎭',
            itemTypes: ['role']
        }
    ],
    
    transaction: {
        cooldown: 1000,
        maxQuantity: 10,
        confirmTimeout: 30000,
        
        refundPolicy: {
            enabled: true,
            window: 300000,
            fee: 0.1
        }
    },
    
    ui: {
        itemsPerPage: 5,
        showOutOfStock: true,
        showOwnedItems: true,
        showAffordability: true,
        
        colors: {
            primary: '#5865F2',
            success: '#43B581',
            error: '#F04747',
            warning: '#FAA61A',
            info: '#00B0F4',
            
            rarity: {
                common: '#99AAB5',
                uncommon: '#2ECC71',
                rare: '#3498DB',
                epic: '#9B59B6',
                legendary: '#F1C40F',
                mythic: '#E74C3C'
            }
        },
        
        emojis: {
            currency: '🪙',
            quantity: '✖️',
            price: '💵',
            owned: '✅',
            outOfStock: '❌',
            
            types: {
                consumable: '🍯',
                upgrade: '⚡',
                tool: '⛏️',
                role: '🎭'
            }
        }
    },
    
    events: {
        restock: {
            enabled: true,
            interval: 86400000,
            announcementChannel: null,
            message: '🛒 **商店已補貨！** 全新道具現已上架！'
        },
        
        sales: {
            enabled: true,
            schedule: [
                {
                    day: 0,
                    discount: 0.2,
                    message: '🔥 **週末特賣！** 所有道具享 8 折優惠！'
                },
            ]
        }
    }
};

export {
    shopItems,
    getItemById,
    getItemsByType,
    getItemPrice,
    validatePurchase
};

export function getCurrentPrice(itemId, { quantity = 1, userData = null } = {}) {
    // 傳入 userData 以支援升級項目的動態指數計價
    const unitPrice = getItemPrice(itemId, userData);
    const basePrice = unitPrice * quantity;
    
    let discount = 0;
    
    const now = new Date();
    if (shopConfig.events.sales.enabled) {
        const today = now.getDay();
        const sale = shopConfig.events.sales.schedule.find(s => s.day === today);
        if (sale) {
            discount += sale.discount;
        }
    }
    
    if (userData) {
        if (userData.roles?.includes('premium')) {
            discount += 0.1;
        }
        
        if (quantity >= 10) {
            discount += 0.1;
        }
    }
    
    discount = Math.max(0, Math.min(1, discount));
    
    return Math.floor(basePrice * (1 - discount));
}

export function getCategoryForItem(itemType) {
    return shopConfig.categories.find(cat => 
        cat.itemTypes.includes(itemType)
    ) || {
        id: 'other',
        name: '其他',
        description: '其他雜項道具',
        icon: '📦'
    };
}

export function getItemsInCategory(categoryId) {
    const category = shopConfig.categories.find(cat => cat.id === categoryId);
    if (!category) return [];
    
    return shopItems.filter(item => 
        category.itemTypes.includes(item.type)
    );
}
