import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { createEmbed, successEmbed, warningEmbed } from '../../utils/embeds.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { ModerationService } from '../../services/moderation/moderationService.js';
import { TitanBotError, replyUserError, ErrorTypes } from '../../utils/errorHandler.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
        .setName("masskick")
        .setDescription("一次踢出伺服器中的多個使用者 (Mass Kick)")
        .addStringOption(option =>
            option
                .setName("users")
                .setDescription("要踢出的使用者 ID 或標註（以空格或逗號分隔）")
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName("reason")
                .setDescription("大量踢出的原因")
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
    category: "moderation",
    abuseProtection: { maxAttempts: 3, windowMs: 60_000 },

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Masskick interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'masskick'
            });
            return;
        }

        const usersInput = interaction.options.getString("users");
        const reason = interaction.options.getString("reason") || "大量踢出 - 未提供原因";

        try {
            const userIds = usersInput
.replace(/<@!?(\d+)>/g, '$1')
.split(/[\s,]+/)
.filter(id => id && /^\d+$/.test(id))
.slice(0, 20);

            if (userIds.length === 0) {
                return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: '請提供有效的使用者 ID 或標註。一次最多 20 位使用者。' });
            }

            if (userIds.includes(interaction.user.id)) {
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: '你不能在大量踢出中包含你自己。' });
            }

            if (userIds.includes(client.user.id)) {
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: '你不能在大量踢出中包含機器人。' });
            }

            const results = {
                successful: [],
                failed: [],
                skipped: []
            };

            for (const userId of userIds) {
                try {
                    const member = await interaction.guild.members.fetch(userId).catch(() => null);
                    
                    if (!member) {
                        results.failed.push({ userId, reason: "使用者不在伺服器中" });
                        continue;
                    }

                    const modCheck = ModerationService.validateHierarchy(interaction.member, member, 'kick');
                    if (!modCheck.valid) {
                        results.skipped.push({
                            user: member.user.tag,
                            userId,
                            reason: ModerationService.buildHierarchySkipReason(interaction.member, member, 'kick'),
                        });
                        continue;
                    }

                    const botCheck = ModerationService.validateBotHierarchy(member, 'kick');
                    if (!botCheck.valid) {
                        results.skipped.push({
                            user: member.user.tag,
                            userId,
                            reason: ModerationService.buildHierarchySkipReason(interaction.member, member, 'kick', 'bot'),
                        });
                        continue;
                    }

                    if (!member.kickable) {
                        results.skipped.push({
                            user: member.user.tag,
                            userId,
                            reason: '目標擁有管理員身分組或託管身分組，或者機器人缺少「踢出成員 (Kick Members)」權限',
                        });
                        continue;
                    }

                    await member.kick(reason);

                    results.successful.push({
                        user: member.user.tag,
                        userId
                    });

                    await logModerationAction({
                        client,
                        guild: interaction.guild,
                        event: {
                            action: "Member Kicked",
                            target: `${member.user.tag} (${member.user.id})`,
                            executor: `${interaction.user.tag} (${interaction.user.id})`,
                            reason: `${reason} (大量踢出)`,
                            metadata: {
                                userId: member.user.id,
                                moderatorId: interaction.user.id,
                                massKick: true
                            }
                        }
                    });

                } catch (error) {
                    logger.error(`Failed to kick user ${userId}:`, error);
                    const reason = error instanceof TitanBotError
                        ? (error.userMessage || error.message)
                        : (error.message || "未知錯誤");
                    results.failed.push({ 
                        userId, 
                        reason, 
                    });
                }
            }

            let description = `**大量踢出結果：**\n\n`;
            
            if (results.successful.length > 0) {
                description += `✅ **成功踢出 (${results.successful.length})：**\n`;
                results.successful.forEach(result => {
                    description += `• ${result.user} (${result.userId})\n`;
                });
                description += '\n';
            }

            if (results.skipped.length > 0) {
                description += `⚠️ **已略過 (${results.skipped.length})：**\n`;
                results.skipped.forEach(result => {
                    description += `• ${result.user} - ${result.reason}\n`;
                });
                description += '\n';
            }

            if (results.failed.length > 0) {
                description += `❌ **失敗 (${results.failed.length})：**\n`;
                results.failed.forEach(result => {
                    description += `• ${result.userId} - ${result.reason}\n`;
                });
            }

            const embed = results.successful.length > 0 ? successEmbed : warningEmbed;
            
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    embed(
                        `👢 大量踢出已完成`,
                        description
                    )
                ]
            });

        } catch (error) {
            logger.error("Error in masskick command:", error);
            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: '處理大量踢出時發生錯誤。請稍後再試。' });
        }
    }
};
