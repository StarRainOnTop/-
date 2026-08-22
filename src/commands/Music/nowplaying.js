import { SlashCommandBuilder } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { buildNowPlayingReply } from '../../services/music/musicActions.js';
import { deferMusicCommand } from '../../services/music/prefixSupport.js';

export default {
    category: 'Music',
    data: new SlashCommandBuilder()
        .setName('nowplaying')
        .setDescription('顯示目前正在播放的曲目 (Now Playing)'),

    async execute(interaction, config, client) {
        await deferMusicCommand(interaction);
        const payload = buildNowPlayingReply(client, interaction.guild.id);
        await InteractionHelper.safeEditReply(interaction, payload);
    },
};
