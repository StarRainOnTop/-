import { EmbedBuilder } from 'discord.js';
import { getUpcomingBirthdays } from '../../../services/birthdayService.js';
import { deleteBirthday } from '../../../utils/database.js';
import { logger } from '../../../utils/logger.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
export default {
    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction);

        const next5 = await getUpcomingBirthdays(client, interaction.guildId, 5);

        if (next5.length === 0) {
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('找不到生日')
                .setDescription('此伺服器中尚未設定任何生日。請使用 `/birthday set` 來新增生日！');
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed]
            });
        }

        let displayIndex = 0;
        for (const birthday of next5) {
            const member = await interaction.guild.members.fetch(birthday.userId).catch(() => null);
            if (!member) {
                deleteBirthday(client, interaction.guildId, birthday.userId).catch(() => null);
                continue;
            }
            displayIndex++;

            let timeUntil = '';
            if (birthday.daysUntil === 0) {
                timeUntil = '🎉 **今天！**';
            } else if (birthday.daysUntil === 1) {
                timeUntil = '📅 **明天！**';
            } else {
                timeUntil = `${birthday.daysUntil} 天後`;
            }
        }

        if (displayIndex === 0) {
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('找不到即將到來的生日')
                .setDescription('目前的伺服器成員沒有找到即將到來的生日。');
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed]
            });
        }

        let birthdayList = `🎂 **接下來 5 個即將到來的生日**\n\n以下是 ${interaction.guild.name} 接下來的 5 個生日：\n\n`;
        displayIndex = 0;
        for (const birthday of next5) {
            const member = await interaction.guild.members.fetch(birthday.userId).catch(() => null);
            if (!member) {
                continue;
            }
            displayIndex++;

            let timeUntil = '';
            if (birthday.daysUntil === 0) {
                timeUntil = '🎉 **今天！**';
            } else if (birthday.daysUntil === 1) {
                timeUntil = '📅 **明天！**';
            } else {
                timeUntil = `${birthday.daysUntil} 天後`;
            }

            birthdayList += `${displayIndex}. **${member.displayName}**\n<@${birthday.userId}>\n📅 **日期：** ${birthday.monthName} ${birthday.day}日\n⏰ **時間：** ${timeUntil}\n\n`;
        }

        birthdayList += `使用 /birthday set 來新增你的生日！`;

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('接下來 5 個即將到來的生日')
            .setDescription(birthdayList);

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [embed]
        });

        logger.info('成功取得即將到來的生日', {
            userId: interaction.user.id,
            guildId: interaction.guildId,
            upcomingCount: displayIndex,
            commandName: 'next_birthdays'
        });
    }
};
