import { SlashCommandBuilder } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import {
    skipTrack,
    stopPlayback,
    pausePlayback,
    resumePlayback,
    shuffleQueue,
    setLoopMode,
    setVolume,
    seekTrack,
    removeFromQueue,
    moveInQueue,
    clearQueue,
    setTwentyFourSeven,
    leaveVoiceChannel,
    replyMusicSuccess,
} from '../../services/music/musicActions.js';
import { deferMusicCommand } from '../../services/music/prefixSupport.js';

export default {
    category: 'Music',
    data: new SlashCommandBuilder()
        .setName('music')
        .setDescription('管理音樂播放、播放佇列與語音工作階段設定')
        .addSubcommand((sub) =>
            sub.setName('pause').setDescription('暫停播放音樂'),
        )
        .addSubcommand((sub) =>
            sub.setName('resume').setDescription('恢復播放音樂'),
        )
        .addSubcommand((sub) =>
            sub.setName('skip').setDescription('跳過目前播放的曲目'),
        )
        .addSubcommand((sub) =>
            sub.setName('stop').setDescription('停止播放並清除佇列'),
        )
        .addSubcommand((sub) =>
            sub.setName('shuffle').setDescription('隨機排序播放佇列'),
        )
        .addSubcommand((sub) =>
            sub
                .setName('loop')
                .setDescription('設定循環播放模式')
                .addStringOption((opt) =>
                    opt
                        .setName('mode')
                        .setDescription('循環模式')
                        .setRequired(true)
                        .addChoices(
                            { name: '關閉 (Off)', value: 'none' },
                            { name: '單曲循環 (Track)', value: 'track' },
                            { name: '佇列循環 (Queue)', value: 'queue' },
                        ),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('volume')
                .setDescription('設定播放音量')
                .addIntegerOption((opt) =>
                    opt.setName('level').setDescription('音量大小 (0-100)').setRequired(true).setMinValue(0).setMaxValue(100),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('seek')
                .setDescription('跳轉至目前曲目的指定播放進度')
                .addIntegerOption((opt) =>
                    opt.setName('seconds').setDescription('要跳轉到的秒數').setRequired(true).setMinValue(0),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('remove')
                .setDescription('從佇列中移除指定的曲目')
                .addIntegerOption((opt) =>
                    opt.setName('position').setDescription('佇列中的編號位置').setRequired(true).setMinValue(1),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('move')
                .setDescription('移動佇列中曲目的順序')
                .addIntegerOption((opt) =>
                    opt.setName('from').setDescription('原本的位置').setRequired(true).setMinValue(1),
                )
                .addIntegerOption((opt) =>
                    opt.setName('to').setDescription('新的位置').setRequired(true).setMinValue(1),
                ),
        )
        .addSubcommand((sub) =>
            sub.setName('clear').setDescription('清空播放佇列'),
        )
        .addSubcommand((sub) =>
            sub.setName('leave').setDescription('讓機器人離開語音頻道'),
        )
        .addSubcommand((sub) =>
            sub
                .setName('247')
                .setDescription('切換 24/7 模式（閒置時保持在語音頻道中）')
                .addBooleanOption((opt) =>
                    opt.setName('enabled').setDescription('啟用或停用 24/7 模式').setRequired(true),
                ),
        ),

    async execute(interaction, config, client) {
        await deferMusicCommand(interaction);
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'pause': {
                const embed = await pausePlayback(client, interaction);
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'resume': {
                const embed = await resumePlayback(client, interaction);
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'skip': {
                const embed = await skipTrack(client, interaction);
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'stop': {
                const embed = await stopPlayback(client, interaction);
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'shuffle': {
                const embed = await shuffleQueue(client, interaction);
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'loop': {
                const embed = await setLoopMode(client, interaction, interaction.options.getString('mode'));
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'volume': {
                const embed = await setVolume(client, interaction, interaction.options.getInteger('level'));
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'seek': {
                const embed = await seekTrack(client, interaction, interaction.options.getInteger('seconds'));
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'remove': {
                const embed = await removeFromQueue(client, interaction, interaction.options.getInteger('position'));
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'move': {
                const embed = await moveInQueue(
                    client,
                    interaction,
                    interaction.options.getInteger('from'),
                    interaction.options.getInteger('to'),
                );
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'clear': {
                const embed = await clearQueue(client, interaction);
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'leave': {
                const embed = await leaveVoiceChannel(client, interaction);
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case '247': {
                const embed = await setTwentyFourSeven(client, interaction, interaction.options.getBoolean('enabled'));
                await replyMusicSuccess(interaction, embed);
                break;
            }
            default:
                await InteractionHelper.safeEditReply(interaction, {
                    content: '未知的音樂子指令。',
                });
        }
    },
};
