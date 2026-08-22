import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { getColor } from '../../config/bot.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
export default {
    data: new SlashCommandBuilder()
        .setName("unlock")
        .setDescription(
            "解除當前頻道的鎖定 (允許 @everyone 再次傳送訊息)",
        )
.setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    category: "moderation",

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Unlock interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'unlock'
            });
            return;
        }

        const channel = interaction.channel;
        const everyoneRole = interaction.guild.roles.everyone;

        try {
            const currentPermissions = channel.permissionsFor(everyoneRole);
            if (
                currentPermissions.has(PermissionFlagsBits.SendMessages) ===
                    true ||
                currentPermissions.has(PermissionFlagsBits.SendMessages) ===
                    null
            ) {
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `${channel} 並未被明確鎖定（@everyone 已經可以傳送訊息）。` });
            }

            await channel.permissionOverwrites.edit(
                everyoneRole,
                { SendMessages: true },
                {
                    type: 0,
                    reason: `頻道由 ${interaction.user.tag} 解除鎖定`,
                },
            );

            await logEvent({
                client,
                guild: interaction.guild,
                event: {
                    action: "頻道已解鎖",
                    target: channel.toString(),
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    metadata: {
                        channelId: channel.id,
                        category: channel.parent?.name || '無'
                    }
                }
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    successEmbed(
                        `🔓 **頻道已解鎖**`,
                        `${channel} 現已解除鎖定。大家現在可以發言了。`,
                    ),
                ],
            });
        } catch (error) {
            logger.error('Unlock command error:', error);
            await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: '嘗試解鎖頻道時發生未預期的錯誤。請檢查我的權限（我需要「管理頻道 (Manage Channels)」權限）。' });
        }
    }
};
