import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getTicketPermissionContext } from '../../utils/ticket/ticketPermissions.js';
import { updateTicketPriority } from '../../services/ticket.js';

export default {
    data: new SlashCommandBuilder()
        .setName("priority")
        .setDescription("設定目前支援客服單的優先級別。")
        .addStringOption((option) =>
            option
                .setName("level")
                .setDescription("客服單的優先級別。")
                .setRequired(true)
                .addChoices(
                    { name: "緊急 (Urgent)", value: "urgent" },
                    { name: "高 (High)", value: "high" },
                    { name: "中 (Medium)", value: "medium" },
                    { name: "低 (Low)", value: "low" },
                    { name: "無 (None)", value: "none" },
                ),
            )
        .setDMPermission(false),
    category: "Ticket",

    async execute(interaction, guildConfig, client) {
        const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferred) {
            return;
        }

        const permissionContext = await getTicketPermissionContext({ client, interaction });
        if (!permissionContext.ticketData) {
            return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: '此指令只能在有效的客服單頻道中使用。' });
        }

        if (!permissionContext.canManageTicket) {
            return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: '您需要「管理頻道」權限或已設定的「客服人員身分組」才能變更客服單優先級。' });
        }

        const priorityLevel = interaction.options.getString("level");
        await updateTicketPriority(interaction.channel, priorityLevel, interaction.user);

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    "已更新優先級",
                    `客服單優先級已設定為 **${priorityLevel.toUpperCase()}**。`,
                ),
            ],
        });

        logger.info('客服單優先級更新成功', {
            userId: interaction.user.id,
            userTag: interaction.user.tag,
            channelId: interaction.channel.id,
            channelName: interaction.channel.name,
            guildId: interaction.guildId,
            priority: priorityLevel,
            commandName: 'priority'
        });
    },
};
