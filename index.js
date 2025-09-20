// --- 1. 웹 서버 설정 (파일 최상단에 위치해야 합니다) ---
const express = require('express');
const app = express();
// Render가 환경 변수로 PORT를 제공하면 그것을 사용하고, 아니면 3000번을 사용합니다.
const port = process.env.PORT || 3000;

// 기본 경로('/')로 접속하면 간단한 응답을 보냅니다.
app.get('/', (req, res) => {
  res.send('Bot is running!');
});

// 설정된 포트에서 웹 서버를 시작합니다.
// 이 코드가 실행되어야 Render가 서비스가 정상이라고 판단합니다.
app.listen(port, () => {
  console.log(`Web server started and listening on port ${port}`);
});


// --- 2. 디스코드 봇 설정 (기존 코드) ---
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, Events } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const dotenv = require('dotenv');

dotenv.config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" }); 

const todos = new Map();

const characters = [
    { label: '활기찬 후배', value: '활기차고 명랑한 후배' },
    { label: '엄격한 교관', value: '군대 교관처럼 엄격하지만 속은 따뜻한 교관' },
    { label: '다정한 선배', value: '언제나 다정하게 챙겨주는 대학교 선배' },
    { label: '츤데레 친구', value: '겉으로는 틱틱대지만 속으로는 챙겨주는 친구' },
];

client.once(Events.ClientReady, () => {
    console.log(`${client.user.tag} 봇이 성공적으로 로그인했습니다!`);
});

// 상호작용 이벤트 리스너 (이하 코드는 변경할 필요 없습니다)
client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isChatInputCommand()) {
        const commandName = interaction.commandName;
        if (commandName === 'todo') {
            const task = interaction.options.getString('할일');
            if (todos.has(interaction.user.id)) {
                await interaction.reply({ content: '이미 진행 중인 할 일이 있어요! 먼저 `/done` 명령어로 완료해주세요.', ephemeral: true });
                return;
            }
            const timeRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId(`time_1h_${task}`).setLabel('1시간').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`time_3h_${task}`).setLabel('3시간').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`time_5h_${task}`).setLabel('5시간').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`time_custom_${task}`).setLabel('직접입력(미구현)').setStyle(ButtonStyle.Secondary).setDisabled(true),
                );
            await interaction.reply({
                content: `**"${task}"** 을(를) 몇 시간 안에 하실 건가요?`,
                components: [timeRow],
                ephemeral: true
            });
        } else if (commandName === 'done') {
            const userId = interaction.user.id;
            const todo = todos.get(userId);
            if (todo) {
                clearTimeout(todo.timer);
                const prompt = `${todo.character} 말투로, 사용자가 '${todo.task}' 할 일을 성공적으로 끝낸 것을 축하하는 짧은 메시지를 한국어로 작성해줘.`;
                const result = await model.generateContent(prompt);
                const response = await result.response;
                const congratulationMessage = response.text();
                await interaction.reply(`🎉 **"${todo.task}"** 완료!`);
                await interaction.followUp(congratulationMessage);
                todos.delete(userId);
            } else {
                await interaction.reply({ content: '진행 중인 할 일이 없어요!', ephemeral: true });
            }
        }
    } else if (interaction.isButton()) {
        const [type, duration, ...taskParts] = interaction.customId.split('_');
        const task = taskParts.join('_');
        if (type === 'time') {
            const hours = parseInt(duration.replace('h', ''));
            const durationMs = hours * 60 * 60 * 1000;
            const characterMenu = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`character_${durationMs}_${task}`)
                        .setPlaceholder('응원받을 캐릭터를 선택하세요!')
                        .addOptions(characters),
                );
            await interaction.update({
                content: '응원해 줄 캐릭터를 선택해주세요!',
                components: [characterMenu]
            });
        }
    } else if (interaction.isStringSelectMenu()) {
        const [type, durationMs, ...taskParts] = interaction.customId.split('_');
        const task = taskParts.join('_');
        if (type === 'character') {
            await interaction.deferUpdate();
            const selectedCharacterValue = interaction.values[0];
            const selectedCharacterLabel = characters.find(c => c.value === selectedCharacterValue).label;
            const userId = interaction.user.id;
            const channel = interaction.channel;
            const prompt = `${selectedCharacterValue} 말투로, 사용자가 '${task}' 할 일을 ${parseInt(durationMs) / 3600000}시간 안에 시작하는 것을 응원하는 짧은 메시지를 한국어로 작성해줘.`;
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const startMessage = response.text();
            await interaction.followUp({ content: `**${selectedCharacterLabel}** 캐릭터가 응원을 시작합니다!` });
            await channel.send(startMessage);
            const timer = setTimeout(async () => {
                if (todos.has(userId)) {
                    const failedTodo = todos.get(userId);
                    const failurePrompt = `${failedTodo.character} 말투로, 사용자가 '${failedTodo.task}' 할 일을 시간 안에 끝내지 못한 것에 대해 아쉬워하거나 다음을 격려하는 짧은 메시지를 한국어로 작성해줘.`;
                    const failureResult = await model.generateContent(failurePrompt);
                    const failureResponse = await failureResult.response;
                    const failureMessage = failureResponse.text();
                    await channel.send(`<@${userId}>, ${failureMessage}`);
                    todos.delete(userId);
                }
            }, parseInt(durationMs));
            todos.set(userId, {
                task: task,
                character: selectedCharacterValue,
                timer: timer,
                channelId: channel.id,
            });
        }
    }
});


// --- 3. 봇 로그인 (파일 최하단에 위치해야 합니다) ---
// 웹 서버가 먼저 켜진 후에 디스코드 봇에 로그인합니다.
client.login(process.env.DISCORD_TOKEN);