import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import {
  disableCategory,
  enableCategory,
  disableCommand,
  enableCommand,
  resolveCategoryChoice,
  buildCommandRegistry,
  isProtectedCommand,
} from '../../services/commandAccessService.js';
import {
  buildDashboardView,
  handleDashboardComponent,
  createDashboardCollectorFilter,
  isCommandAccessCustomId,
} from './modules/commands_dashboard.js';

const DASHBOARD_TIMEOUT_MS = 10 * 60 * 1000;

function buildCategoryChoices(client) {
  const registry = buildCommandRegistry(client);
  return [...registry.values()]
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
    .slice(0, 25)
    .map((category) => ({
      name: `${category.icon} ${category.displayName}`.slice(0, 100),
      value: category.key,
    }));
}

async function ensureManageGuild(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: '你需要 **管理伺服器** 權限才能管理指令。' });
    return false;
  }

  return true;
}

export default {
  data: new SlashCommandBuilder()
    .setName('commands')
    .setDescription('在此伺服器中啟用或停用機器人指令與類別')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('dashboard')
        .setDescription('開啟互動式指令存取權限儀表板'),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('disable')
        .setDescription('停用指令或整個類別')
        .addStringOption((option) =>
          option
            .setName('scope')
            .setDescription('要停用單一指令還是整個類別')
            .setRequired(true)
            .addChoices(
              { name: '類別', value: 'category' },
              { name: '指令', value: 'command' },
            ),
        )
        .addStringOption((option) =>
          option
            .setName('target')
            .setDescription('類別或指令名稱')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('enable')
        .setDescription('啟用指令或整個類別')
        .addStringOption((option) =>
          option
            .setName('scope')
            .setDescription('要啟用單一指令還是整個類別')
            .setRequired(true)
            .addChoices(
              { name: '類別', value: 'category' },
              { name: '指令', value: 'command' },
            ),
        )
        .addStringOption((option) =>
          option
            .setName('target')
            .setDescription('類別或指令名稱')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    ),
  category: 'Core',

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);

    if (focused.name !== 'target') {
      return interaction.respond([]);
    }

    const scope = interaction.options.getString('scope');
    const query = focused.value.toLowerCase();

    if (scope === 'category') {
      const choices = buildCategoryChoices(interaction.client)
        .filter((choice) => choice.name.toLowerCase().includes(query) || choice.value.includes(query))
        .slice(0, 25);
      return interaction.respond(choices);
    }

    // 針對指令範圍，取得所有指令（包含子指令）
    const registry = buildCommandRegistry(interaction.client);
    const allCommands = [];
    
    // 檢查查詢是否符合類別名稱 - 若是，則顯示該類別底下的指令
    const matchedCategory = resolveCategoryChoice(interaction.client, query);
    
    if (matchedCategory) {
      for (const command of matchedCategory.commands) {
        if (!isProtectedCommand(command.name)) {
          allCommands.push(command.name);
        }
      }
    } else {
      // 顯示所有指令
      for (const category of registry.values()) {
        for (const command of category.commands) {
          // 包含基礎指令與子指令
          if (!isProtectedCommand(command.name)) {
            allCommands.push(command.name);
          }
        }
      }
    }

    const choices = allCommands
      .filter((name) => name.includes(query))
      .slice(0, 25)
      .map((name) => ({ name: `/${name}`, value: name }));

    return interaction.respond(choices);
  },

  async execute(interaction, config, client) {
    if (!(await ensureManageGuild(interaction))) {
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'dashboard') {
      const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
      if (!deferred) {
        return;
      }

      const view = await buildDashboardView(client, interaction.guildId, interaction.guild, 'overview');
      await InteractionHelper.safeEditReply(interaction, {
        embeds: [view.embed],
        components: view.components,
      });

      const replyMessage = await interaction.fetchReply().catch(() => null);
      if (!replyMessage) {
        return;
      }

      const collector = replyMessage.createMessageComponentCollector({
        filter: createDashboardCollectorFilter(interaction.user.id, interaction.guildId),
        time: DASHBOARD_TIMEOUT_MS,
      });

      collector.on('collect', async (componentInteraction) => {
        try {
          if (!isCommandAccessCustomId(componentInteraction.customId)) {
            return;
          }
          await handleDashboardComponent(componentInteraction, client);
        } catch (error) {
          logger.error('Command access dashboard interaction failed', {
            error: error.message,
            customId: componentInteraction.customId,
            guildId: interaction.guildId,
          });
          await replyUserError(componentInteraction, {
            type: ErrorTypes.UNKNOWN,
            message: error.message || '更新指令存取權限失敗。',
          }).catch(() => {});
        }
      });

      collector.on('end', async () => {
        const finalView = await buildDashboardView(client, interaction.guildId, interaction.guild, 'overview');
        const disabledComponents = finalView.components.map((row) => {
          const newRow = row.toJSON();
          newRow.components = newRow.components.map((component) => ({ ...component, disabled: true }));
          return newRow;
        });

        await replyMessage.edit({ components: disabledComponents }).catch(() => {});
      });

      return;
    }

    const scope = interaction.options.getString('scope');
    const target = interaction.options.getString('target');
    const isDisable = subcommand === 'disable';

    const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
    if (!deferred) {
      return;
    }

    if (scope === 'category') {
      const category = resolveCategoryChoice(client, target);
      if (!category) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `找不到符合 \`${target}\` 的類別。請使用 \`/commands dashboard\` 來瀏覽類別。` });
      }

      if (isDisable) {
        await disableCategory(client, interaction.guildId, category.key);
        return InteractionHelper.safeEditReply(interaction, {
          embeds: [
            successEmbed(
              '已停用類別',
              `**${category.displayName}** 的所有指令現已停用。\n受保護的指令將繼續保持可用。`,
            ),
          ],
        });
      }

      await enableCategory(client, interaction.guildId, category.key);
      return InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed('已啟用類別', `**${category.displayName}** 的指令現已啟用（個別停用的指令除外）。`)],
      });
    }

    const commandName = target.toLowerCase();
    if (isDisable) {
      await disableCommand(client, interaction.guildId, commandName);
      return InteractionHelper.safeEditReply(interaction, {
        embeds: [successEmbed('已停用指令', `\`/${commandName}\` 現已在此伺服器中停用。`)],
      });
    }

    await enableCommand(client, interaction.guildId, commandName);
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [successEmbed('已啟用指令', `\`/${commandName}\` 現已在此伺服器中啟用。`)],
    });
  },
};
