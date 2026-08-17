import { 
  SlashCommandBuilder, 
  PermissionFlagsBits, 
  EmbedBuilder 
} from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('send-rules')
    .setDescription('發送中文版伺服器規則 Embed')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // 僅限管理員執行

  async execute(interaction) {
    const rulesEmbed = new EmbedBuilder()
      .setColor(0x8B5CF6) // 紫色邊框
      // 替換為你的 RULES GIF 圖片連結（例如上傳到 Discord 後複製的 .gif 位址）
      .setImage('https://tenor.com/bV5hM.gif') 
      .setDescription(`
🔮 **閱讀規則 / READ RULES:** 🔮

> 本伺服器遵守 Discord 的服務條款。任何成員違反服務條款的行為都將由管理團隊進行審查並公布處罰。請閱讀條款：https://discordapp.com/terms | https://discordapp.com/guidelines **1-1**

⚡ **規則 1：尊重他人**
> :arrow_blue: 請尊重所有成員。嚴禁任何形式的恐嚇、言語騷擾、性別歧視、種族歧視、仇恨言論、人肉搜索（Doxxing）或網路獵巫。

⚡ **規則 2：適當內容與禁止 NSFW**
> :arrow_blue: 任何頻道均嚴禁發布色情、血腥、暴力或 NSFW（不適合工作場所觀看）的內容，此規則亦適用於自訂表情符號。

⚡ **規則 3：禁止宣傳與廣告**
> :arrow_blue: 嚴禁以任何形式（包括私訊 DM）進行未經許可的宣傳或廣告，推廣內容請一律前往指定宣傳頻道。

⚡ **規則 4：禁止刷版與惡意內容**
> :arrow_blue: 嚴禁文字刷版、連續發送重複訊息，或在語音頻道中爆音/使用變聲器。發送 IP 抓取連結、病毒或崩潰影片者將被立即永久封鎖。

⚡ **規則 5：避免討論敏感話題**
> :arrow_blue: 請保持理性與良好的社群氛圍，切勿討論政治、宗教等容易引發強烈爭執的敏感話題。

⚡ **規則 6：聯繫團隊與客服專區**
> :arrow_blue: 請勿直接私訊（DM）管理團隊成員。如需協助或申訴，請至客服頻道開啟 Ticket 工單。

⚡ **規則 7：禁止乞討**
> :arrow_blue: 嚴禁在伺服器任何地方乞討 Robux、Discord Nitro、虛寶或身分組。

⚡ **規則 8：正確使用頻道**
> :arrow_blue: 請在對應的頻道進行相關討論（例如：機器人指令請至指令專用頻道發送）。

\`\`\`
... 感謝您的理解與配合，讓我們共同維護良好的社群環境！ ...
\`\`\`
🟣🟣🟣🟣🟣🟣🟣🟣🟣🟣🟣🟣🟣🟣🟣🟣🟣🟣🟣🟣
      `);

    // 發送 Embed 至當前頻道
    await interaction.channel.send({ embeds: [rulesEmbed] });

    // 給執行指令的管理員隱藏回覆
    await interaction.reply({ 
      content: '✅ 規則公告已成功發送！', 
      ephemeral: true 
    });
  },
};
