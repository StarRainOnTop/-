const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rules')
        .setDescription('發送伺服器繁體中文規則 Embed 卡片')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('選擇要發送規則的頻道')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)),

    async execute(interaction) {
        const targetChannel = interaction.options.getChannel('channel');

        // 1. 建立頂部圖片 Embed (Banner)
        const bannerEmbed = new EmbedBuilder()
            .setColor(0x800080) // 紫色邊條 (HEX: #800080)
            .setImage('https://i.imgur.com/your-rules-image.png'); // 替換成你的 Rules Banner 圖片網址

        // 2. 建立規則內容 Embed
        const rulesEmbed = new EmbedBuilder()
            .setColor(0x800080) // 與 Banner 相同的紫色邊條
            .setDescription(`
🔮 **閱讀規則 / READ RULES:** 🔮

> 本伺服器遵守 Discord 的服務條款。任何成員違反服務條款的行為都將由管理團隊進行審查並公布處罰。請閱讀條款：https://discordapp.com/terms | https://discordapp.com/guidelines **1-1**

⚡ **規則 1：尊重他人 Conduct**
> ❯❯ 請尊重所有成員。嚴禁任何形式的恐嚇、言語騷擾、性別歧視、種族歧視、仇恨言論、人肉搜索（Doxxing）或網路獵巫。

⚡ **規則 2：適當內容 Content 與禁止 NSFW**
> ❯❯ 任何頻道均嚴禁發布色情、血腥、暴力或 NSFW（不適合工作場所觀看）的內容，此規則亦適用於自訂表情符號。

⚡ **規則 3：禁止宣傳 Advertising 與廣告**
> ❯❯ 嚴禁以任何形式（包括私訊 DM）進行未經許可的宣傳或廣告，推廣內容請一律前往指定宣傳頻道。

⚡ **規則 4：禁止刷版 Spam 與惡意內容**
> ❯❯ 嚴禁文字刷版、連續發送重複訊息，或在語音頻道中爆音/使用變聲器。發送 IP 抓取連結、病毒或崩潰影片者將被立即永久封鎖。

⚡ **規則 5：避免討論敏感話題 (Sensitive Topics)**
> ❯❯ 請保持理性與良好的社群氛圍，切勿討論政治、宗教等容易引發強烈爭執的敏感話題。

⚡ **規則 6：聯繫團隊與客服專區 (Contact Support)**
> ❯❯ 請勿直接私訊（DM）管理團隊成員。如需協助或申訴，請至客服頻道開啟 Ticket 工單。

⚡ **規則 7：禁止乞討 (No Begging)**
> ❯❯ 嚴禁在伺服器任何地方乞討 Robux、Discord Nitro、虛寶或身分組。

⚡ **規則 8：正確使用頻道 (Correct Channel Usage)**
> ❯❯ 請在對應的頻道進行相關討論（例如：機器人指令請至指令專用頻道發送）。
            `);

        try {
            // 一次發送兩個 Embed，Discord 會自動把它們組合在一起
            await targetChannel.send({ embeds: [bannerEmbed, rulesEmbed] });

            await interaction.reply({ 
                content: `✅ 規則 Embed 已成功發送至 ${targetChannel}！`, 
                ephemeral: true 
            });
        } catch (error) {
            console.error(error);
            await interaction.reply({ 
                content: '❌ 發送失敗，請確認機器人擁有在該頻道發送訊息及 Embed 的權限！', 
                ephemeral: true 
            });
        }
    },
};
