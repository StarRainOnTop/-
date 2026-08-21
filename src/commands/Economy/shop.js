import { SlashCommandBuilder } from 'discord.js';
import shopBrowse from './modules/shop_browse.js';
import { withErrorHandling } from '../../utils/errorHandler.js';

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('瀏覽經濟商店。'),

    execute: withErrorHandling(async (interaction, config, client) => {
        return shopBrowse.execute(interaction, config, client);
    }, { command: 'shop' })
};
