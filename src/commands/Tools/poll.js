import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { getColor } from '../../config/bot.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
const EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
const MAX_OPTIONS = 10;
export default {
    data: new SlashCommandBuilder()
        .setName('poll')
        .setDescription('建立一個最多包含 10 個選項的簡單投票')
        .addStringOption(option =>
            option.setName('question')
                .setDescription('投票問題')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('option1')
                .setDescription('第一個選項')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('option2')
                .setDescription('第二個選項')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('option3')
                .setDescription('第三個選項 (選填)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option4')
                .setDescription('第四個選項 (選填)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option5')
                .setDescription('第五個選項 (選填)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option6')
                .setDescription('第六個選項 (選填)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option7')
                .setDescription('第七個選項 (選填)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option8')
                .setDescription('第八個選項 (選填)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option9')
                .setDescription('第九個選項 (選填)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('option10')
                .setDescription('第十個選項 (選填)')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('anonymous')
                .setDescription('建立匿名投票 (預設：false)')
                .setRequired(false)),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferSuccess) {
            logger.warn(`Poll interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'poll'
            });
            return;
        }

        const question = interaction.options.getString('question');
        const isAnonymous = interaction.options.getBoolean('anonymous') || false;

        const options = [];
        for (let i = 1; i <= MAX_OPTIONS; i++) {
            const option = interaction.options.getString(`option${i}`);
            if (option) options.push(option);
        }

        if (options.length < 2) {
            throw new Error("You must provide at least 2 options for the poll.");
        }

        let description = `**${question}**\n\n`;
        options.forEach((option, index) => {
            description += `${EMOJIS[index]} ${option}\n`;
        });

        if (isAnonymous) {
            description += '\n*這是一個匿名投票。投票結果不會追蹤到使用者。*';
        } else {
            description += '\n*使用表情符號進行投票！*';
        }

        const embed = successEmbed(
            `📊 ${isAnonymous ? '匿名 ' : ''}投票`,
            description
        );

        const message = await interaction.channel.send({ embeds: [embed] });

        for (let i = 0; i < options.length; i++) {
            await message.react(EMOJIS[i]);
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        await InteractionHelper.safeEditReply(interaction, {
            content: '✅ 投票建立成功！',
        });
    },
};
