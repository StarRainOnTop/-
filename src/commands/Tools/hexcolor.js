import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { getColor } from '../../config/bot.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
export default {
    data: new SlashCommandBuilder()
        .setName('hexcolor')
        .setDescription('產生隨機十六進位顏色與預覽')
        .addStringOption(option =>
            option.setName('color')
                .setDescription('特定十六進位顏色 (例如：#FF5733 或 FF5733)')
                .setRequired(false)),

    async execute(interaction) {
        await InteractionHelper.safeExecute(
            interaction,
            async () => {
                let hexColor = interaction.options.getString('color');
                let isRandom = false;

                if (!hexColor) {
                    isRandom = true;
                    hexColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
                } else {
                    hexColor = hexColor.replace('#', '');
                    if (!/^[0-9A-Fa-f]{3,6}$/.test(hexColor)) {
                        return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: '請提供有效的十六進位代碼。\n\n**有效格式：**\n• `#FF5733` (帶有井號)\n• `FF5733` (不帶井號)\n• `F57` (3 位數簡寫)\n\n**無效：** `#GG5733` (G 不是十六進位數字)' });
                    }

                    if (hexColor.length === 3) {
                        hexColor = hexColor.split('').map(c => c + c).join('');
                    }

                    hexColor = '#' + hexColor.toUpperCase();
                }

                const r = parseInt(hexColor.slice(1, 3), 16);
                const g = parseInt(hexColor.slice(3, 5), 16);
                const b = parseInt(hexColor.slice(5, 7), 16);

                const brightness = (r * 299 + g * 587 + b * 114) / 1000;
                const textColor = brightness > 128 ? '#000000' : '#FFFFFF';

                const colorPreviewUrl = `https://dummyimage.com/200x100/${hexColor.replace('#', '')}/${textColor.replace('#', '')}?text=${encodeURIComponent(hexColor)}`;

                const colorName = getColorName(hexColor);

                const embed = successEmbed(
                    '🎨 顏色資訊',
                    `**Hex：** \`${hexColor}\`\n` +
                    `**RGB：** \`rgb(${r}, ${g}, ${b})\`\n` +
                    `**HSL：** \`${rgbToHsl(r, g, b)}\`\n` +
                    `**名稱：** ${colorName || '自訂顏色'}`
                )
                    .setColor(hexColor)
                    .setImage(colorPreviewUrl);

                if (isRandom) {
                    embed.setFooter({ text: '隨機產生的顏色' });
                }

                await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            },
            '無法產生顏色資訊。請再試一次。',
            {
                autoDefer: true,
                deferOptions: { flags: MessageFlags.Ephemeral }
            }
        );
    },
};

function rgbToHsl(r, g, b) {
    r /= 255, g /= 255, b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0;
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }

    return `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
}

function getColorName(hex) {
    const colors = {
        '#FF0000': '紅色',
        '#00FF00': '綠色',
        '#0000FF': '藍色',
        '#FFFF00': '黃色',
        '#FF00FF': '洋紅色',
        '#00FFFF': '青色',
        '#000000': '黑色',
        '#FFFFFF': '白色',
        '#808080': '灰色',
        '#FFA500': '橙色',
        '#800080': '紫色',
        '#A52A2A': '棕色',
        '#FFC0CB': '粉紅色',
        '#008000': '深綠色',
        '#000080': '海軍藍',
        '#FFD700': '金色',
        '#C0C0C0': '銀色',
        '#FF6347': '番茄紅',
        '#40E0D0': '綠松石色',
        '#E6E6FA': '薰衣草紫'
    };
    
    if (colors[hex.toUpperCase()]) {
        return colors[hex.toUpperCase()];
    }
    
    const hexValue = parseInt(hex.replace('#', ''), 16);
    let closestColor = '';
    let minDistance = Infinity;
    
    for (const [colorHex, name] of Object.entries(colors)) {
        const colorValue = parseInt(colorHex.replace('#', ''), 16);
        const distance = Math.abs(hexValue - colorValue);
        
        if (distance < minDistance) {
            minDistance = distance;
            closestColor = name;
        }
    }
    
    return minDistance < 1000000 ? `接近 ${closestColor}` : null;
}
