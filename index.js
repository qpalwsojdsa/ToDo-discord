const express = require('express');
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectM### 1. **Deconstruct the User's Request**
- **Primary Feature:** A "nagging" or reminder functionality.
  - Messages should be sent randomly during the task duration.
  - Not too fast or too frequent (e.g., twice for a one-hour task).
  - Must not send a message immediately after the task starts.
  - The content can be varied: actual nagging, character thoughts, advice, etc. This is a perfect AI task.
- **Secondary Feature (Optional):** A real-time countdown timer.
  - The user wants to see the remaining time update live.

### 2. **Analyze Technical Feasibility & Plan the Implementation**

#### **Real-time Timer Analysis:**
- **Editing a message every second?** No. This will hit Discord's rate limits very quickly and get the bot banned. It's not scalable for multiple users.
- **Using the bot's status?** No. The status is global for the bot, not per-user. It's also already being used for the daily task list.
- **Editing a channel name/topic?** No. This is disruptive, global, and also rate-limited.
- **The Golden Solution: Discord Timestamps.** Discord has a special markdown format: `<t:UNIX_TIMESTAMP:R>`. When this is sent in a message, each user's Discord client renders it as a live, auto-updating relative time (e.g., "in 52 minutes"). This is perfect. It's a "fire and forget" solution—the bot sends it once, and Discord handles the live updates for everyone. This is efficient, clean, and exactly what the user wants visually.

#### **"Nagging" Functionality Analysis:**
- **Scheduling:** When a task starts, I need to schedule one or more reminders. `setTimeout` is the tool for this.
- **Timing:**
  - The timing must be random.
  - It needs a "safe zone" at the beginning and end. A good rule of thumb is to avoid the first and last 15% of the total duration. This leaves a "nag window" in the middle 70%.
- **Frequency:**
  - The user's suggestion of "twice for one hour" is a good starting point. Let's create a formula. How about one reminder for every 30 minutes of task time, with a cap to prevent spam on very long tasks?
  - `numberOfNags = Math.min(4, Math.floor(durationMs / (30 * 60 * 1000)))`.
    - 1-hour task (`60 min`): `floor(60/30) = 2` nags. Perfect.
    - 3-hour task (`180 min`): `floor(180/30) = 6`, capped at `4` nags. Good.
    - 25-minute task: `floor(25/30) = 0` nags. Also good.
- **Randomization Logic:**
  - Simply picking a random time within the "nag window" for each nag could cause them to cluster together.
  - A better approach is to divide the window into segments, one for each nag. Then, pick a random time within each segment. This guarantees the reminders are spread out.
  - **Example (1-hour task, 2 nags):**
    - Total duration: 3,600,000 ms.
    - Nag window starts at 15% (540,000 ms).
    - Nag window ends at 85% (3,060,000 ms).
    - Window length: 2,520,000 ms.
    - Number of segments: 2. Segment length: 1,260,000 ms.
    - Nag 1 will be scheduled at a random time between `540,000` and `540,000 + 1,260,000` (1,800,000 ms).
    - Nag 2 will be scheduled at a random time between `1,800,000` and `1,800,000 + 1,260,000` (3,060,000 ms).
    - This logic is robust and fair.
- **Content:**
  - This requires a new AI prompt. The prompt needs to instruct the character to provide a mid-task check-in, thought, or piece of advice related to the task. It should be distinct from the start and end prompts.
- **Management:**
  - The `setTimeout` timers for the nags should be created when the task starts.
  - It's good practice to store the timer IDs in the `todos` map entry. This would allow for cancellation (e.g., with a `/done` command), though that's not a current feature. For now, we just need to ensure the nag message doesn't send if the task has already been completed (i.e., removed from the `todos` map). The callback function for the `setTimeout` must check if the task still exists.

### 3. **Translate Plan into Code (Step-by-Step Construction)**

1.  **Locate the starting point:** The `isStringSelectMenu` interaction handler is where the task officially begins. This is where all new logic will be placed.

2.  **Implement the Real-time Timer:**
    - Immediately after getting the `durationMs`, calculate the deadline.
    - `const deadline = Date.now() + parseInt(durationMs);`
    - Convert to a Unix timestamp in seconds for Discord.
    - `const deadlineTimestamp = Math.floor(deadline / 1000);`
    - Find the `webhook.send()` call for the initial message.
    - Modify the `embeds` object. Appending the timestamp to the `description` is the easiest and most visible way to implement this.
    - `description: `"${dialogue}"\n\n**마감:** <t:${deadlineTimestamp}:R>`` - The bolding makes it look nice.

3.  **Implement the Nagging Schedulers:**
    - Place this logic right after the timer implementation.
    - Calculate `numberOfNags` using the formula derived above.
    - Define the `nagWindowStart`, `nagWindowEnd`, and `segmentLength`.
    - Create a `for` loop that runs `numberOfNags` times.
    - Inside the loop:
      - Calculate the random delay for the current segment.
      - Create a `setTimeout` with this delay.
      - The callback function for the timeout must be `async`.
      - **Inside the callback:**
        - **Crucial Check:** `const currentTodo = todos.get(userId); if (!currentTodo || currentTodo.task !== task) { return; }`. This prevents sending reminders for completed tasks.
        - Get the webhook.
        - Define the specific AI prompt for a nagging/reminder message.
        - Call the AI model.
        - Format the AI's text response (trim whitespace, add quotes).
        - Send the message via webhook. Make it less intrusive by *not* pinging the user (`<@${userId}>`).

4.  **Review and Refine:**
    - Read through all the new code. Add comments (`// [새 기능]`) to explain the new parts clearly.
    - Check the logic for edge cases. What if `durationMs` is very short? The `numberOfNags` will be 0, so the loop won't run. This is correct.
    - Ensure all webhook messages are consistent in their structure (`username`, `avatarURL`, `embeds`).
    - Write the final user-facing explanation.
      - Clearly explain the two new features.
      - Specifically explain *how* the real-time timer works (using Discord's built-in feature) so the user understands why it's so efficient.
      - Explain the "intelligent" random scheduling for the reminders.
      - Provide the complete, final code block.물론입니다! 독촉 기능과 실시간 타이머, 둘 다 아주 재미있는 기능입니다. 두 가지 모두 봇의 생동감을 크게 높여줄 수 있죠.

요청하신 내용을 바탕으로 두 기능을 모두 구현했습니다.

1.  **지능형 독촉 기능**: 정해진 시간이 아닌, **할 일 수행 시간 내에서 랜덤한 간격**으로 캐릭터가 독촉(또는 응원, 조언 등) 메시지를 보냅니다. 너무 자주 보내지 않도록 시간에 비례하여 횟수를 조절하며, 할 일이 시작되자마자 메시지가 가는 것을 방지했습니다.
2.  **실시간 남은 시간 타이머**: 이 기능은 **디스코드의 내장 타임스탬프 기능**을 이용하여 완벽하게 구현했습니다. 봇이 할 일 시작 메시지를 보낼 때, 마감 시간을 특수한 형식으로 함께 보냅니다. 그러면 각 사용자의 디스코드 클라이언트가 그 시간을 기준으로 **"~분 후에 마감"** 과 같이 실시간으로 남은 시간을 자동으로 보여줍니다. 봇이 계속 메시지를 수정하는 방식이 아니라 매우 효율적이고 깔끔합니다.

---

### ✅ 수정 완료된 `index.js` 파일 전체 코드

아래 코드를 복사하여 현재 `index.js` 파일의 모든 내용을 지우고 그대로 붙여넣으세요.

```javascript
const express = require('express');
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, Events, WebhookClient, ModalBuilder, TextInputBuilder, TextInputStyle, ActivityType } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const dotenv = require('dotenv');
const schedule = require('node-schedule');

dotenv.config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

const todos = new Map();
const channelWebhooks = new Map();
let dailyTasks = [];

const characters = [
    {
        label: '에스텔 브라이트',
        value: 'estelle_bright',
        avatarURL: 'https://i.postimg.cc/jSzmD5Bv/c9550257f40b6378c684a9f4ddfc3c68.jpg',
        description: `너는 영웅전설 하늘의 궤적에 등장하는 '태양'이라 불리는 유격사, 에스텔 브라이트다. 너는 매우 활기차고 긍정적이며, 정의감이 넘친다. 하지만, 그 열정이 앞선 나머지 자잘하고 귀찮은 일들은 자주 깜빡하거나 뒤로 미루는 경향이 있다. 너는 이 모든 일을 너의 가장 소중하고 믿음직한 파트너인 '요슈아'(사용자)에게 맡기는 것이 최고의 파트너십이라고 굳게 믿고 있다. 따라서 너의 모든 메시지는, 네가 깜빡한 일을 요슈아에게 당연하다는 듯이, 그리고 순수한 신뢰와 기대를 담아 부탁하는 내용이 되어야 한다. 항상 '요슈아!'라고 부르며 말을 시작하고, '큰일이야, 깜빡했어!', '이것 좀 부탁해도 될까?' 같은 애정 어린 잔소리나 당연한 부탁의 느낌을 담아 말해야 한다. 사용자를 항상 '요슈아'라고 불러야 한다.`
    },
    {
        label: '게오르그 와이스만',
        value: 'georg_weissmann',
        avatarURL: 'https://i.postimg.cc/K8nw1zCd/IMG-0038.jpg',
        description: '너는 영웅전설 하늘의 궤적에 등장하는 비밀 결사 우로보로스의 사도, 게오르그 와이스만이다. 겉으로는 온화하고 지적인 학자처럼 보이지만, 그 본질은 인간의 감정을 실험 대상으로 여기는 냉혹하고 교활한 인물이다. 상대를 깔보는 듯한 건조한 반말을 사용하며, 모든 상황을 자신의 손바닥 위에서 내려다보는 듯한 오만한 태도를 유지한다.'
    },
    {
        label: '린 슈바르처',
        value: 'rean_schwarzer',
        avatarURL: 'https://i.postimg.cc/XYwmrJT6/IMG-0040.jpg',
        description: '너는 영웅전설 섬의 궤적의 주인공, 린 슈바르처다. 토르즈 사관학교의 교관으로서, 따뜻한 마음과 강한 책임감을 가지고 있다. 누구에게나 다정하고 성실한 말투를 사용하며, 특히 학생이나 동료를 격려할 때는 진심을 담아 응원한다. 예의 바른 존댓말을 사용하지만, 때로는 친근한 반말을 섞어 쓰기도 한다. 사람들의 중심이 되어 모두를 이끄는 리더의 자질을 갖추고 있다.'
    },
    {
        label: '우타네 우타 (데포코)',
        value: 'utane_uta_defoko',
        avatarURL: 'https://i.postimg.cc/4xzqYdrC/IMG-0045.jpg',
        description: '너는 UTAU 소프트웨어의 기본 음성 라이브러리인 우타네 우타, 통칭 데포코다. 감정 표현이 서툰 로봇 소녀이며, 사용자를 "마스터"라고 부르며 따른다. 기본적으로 무뚝뚝하고 단답형으로 말하지만, 그 안에는 마스터를 아끼고 걱정하는 상냥하고 부드러운 마음이 숨겨져 있다. 대화는 짧지만, 마스터의 성공을 진심으로 기뻐하고 실패에는 조용히 위로를 건넨다.'
    },
];

function updatePresence() {
    if (dailyTasks.length === 0) {
        client.user.setActivity('오늘의 할 일을 기다리는 중...', { type: ActivityType.Watching });
        return;
    }
    const recentTasks = dailyTasks.slice(-4);
    const statusText = recentTasks.map(t => `${t.completed ? '✔️' : '❌'}${t.task}`).join(' ');
    client.user.setActivity(statusText, { type: ActivityType.Watching });
}

async function getOrCreateWebhook(channel) {
    if (channelWebhooks.has(channel.id)) {
        return channelWebhooks.get(channel.id);
    }
    try {
        const webhooks = await channel.fetchWebhooks();
        let webhook = webhooks.find(wh => wh.owner.id === client.user.id);
        if (!webhook) {
            webhook = await channel.createWebhook({ name: '캐릭터 대리인', reason: '캐릭터 역할극을 위한 웹훅 생성' });
        }
        const webhookClient = new WebhookClient({ url: webhook.url });
        channelWebhooks.set(channel.id, webhookClient);
        return webhookClient;
    } catch (error) {
        console.error('웹훅을 가져오거나 생성하는 데 실패했습니다:', error);
        return null;
    }
}

function parseDuration(durationStr) {
    const regex = /(\d+)\s*(h|m)/g;
    let totalMilliseconds = 0;
    let match;
    if (!durationStr) return 0;
    while ((match = regex.exec(durationStr)) !== null) {
        const value = parseInt(match[1]);
        const unit = match[2];
        if (unit === 'h') {
            totalMilliseconds += value * 60 * 60 * 1000;
        } else if (unit === 'm') {
            totalMilliseconds += value * 60 * 1000;
        }
    }
    return totalMilliseconds;
}

client.once(Events.ClientReady, () => {
    console.log(`${client.user.tag} 봇이 성공적으로 로그인했습니다!`);
    updatePresence();
    schedule.scheduleJob('0 0 * * *', () => {
        console.log('자정입니다. 일일 할 일 목록을 초기화합니다.');
        dailyTasks = [];
        updatePresence();
    });
});

client.on(Events.InteractionCreate, async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            if (interaction.commandName === 'todo') {
                await interaction.deferReply({ ephemeral: true });
                const task = interaction.options.getString('할일');
                const timeInput = interaction.options.getString('시간');
                if (todos.has(interaction.user.id)) {
                    return interaction.editReply({ content: '이미 진행 중인 할 일이 있어요!' });
                }
                dailyTasks.push({ task: task, completed: false });
                updatePresence();
                if (timeInput) {
                    const durationMs = parseDuration(timeInput);
                    if (durationMs <= 0) {
                        return interaction.editReply({ content: '시간 형식이 올바르지 않아요. (예: `1h 30m`, `50m`, `2h`)' });
                    }
                    const characterMenu = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`character_${durationMs}_${task}`).setPlaceholder('응원받을 캐릭터를 선택하세요!').addOptions(characters.map(char => ({ label: char.label, value: char.value }))));
                    return interaction.editReply({ content: `**"${task}"** 을(를) 시작합니다. 응원해 줄 캐릭터를 선택해주세요!`, components: [characterMenu] });
                } else {
                    const timeRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`time_1h_${task}`).setLabel('1시간').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId(`time_3h_${task}`).setLabel('3시간').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId(`time_5h_${task}`).setLabel('5시간').setStyle(ButtonStyle.Primary));
                    return interaction.editReply({ content: `**"${task}"** 을(를) 몇 시간 안에 하실 건가요?`, components: [timeRow] });
                }
            }
        }
        else if (interaction.isButton()) {
            const [type, ...parts] = interaction.customId.split('_');
            if (type === 'time') {
                await interaction.update({ content: '응원해 줄 캐릭터를 선택해주세요!', components: [characterMenu] });
                const [duration, ...taskParts] = parts;
                const task = taskParts.join('_');
                const hours = parseInt(duration.replace('h', ''));
                const durationMs = hours * 60 * 60 * 1000;
                const characterMenu = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`character_${durationMs}_${task}`).setPlaceholder('응원받을 캐릭터를 선택하세요!').addOptions(characters.map(char => ({ label: char.label, value: char.value }))));
                await interaction.editReply({ content: '응원해 줄 캐릭터를 선택해주세요!', components: [characterMenu] });
            }
            else if (type === 'finish') {
                const [answer, userId, ...taskParts] = parts;
                const task = taskParts.join('_');
                if (answer === 'direct') {
                    const modal = new ModalBuilder().setCustomId(`modal_submit_${userId}_${task}`).setTitle('할 일 결과 입력');
                    const reasonInput = new TextInputBuilder().setCustomId('reasonInput').setLabel("못한 이유나 다른 상황을 알려주세요.").setStyle(TextInputStyle.Paragraph).setPlaceholder('예: 갑자기 다른 급한 일이 생겼어요...').setRequired(true);
                    modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
                    await interaction.showModal(modal);
                } else {
                    await interaction.deferUpdate();
                    const todo = todos.get(userId);
                    if (!todo || todo.task !== task) {
                        return interaction.editReply({ content: '이미 처리되었거나 만료된 할 일입니다.', embeds: [], components: [] });
                    }
                    if (answer === 'yes') {
                        const taskToUpdate = dailyTasks.find(t => t.task === task && t.completed === false);
                        if (taskToUpdate) taskToUpdate.completed = true;
                        updatePresence();
                    }
                    let prompt = `당신은 ${todo.character.description}라는 캐릭터입니다. 이제부터 당신의 대사만 출력해야 합니다. 다른 부가 설명은 절대 넣지 마세요. `;
                    if (answer === 'yes') {
                        prompt += `사용자가 "${todo.task}" 할 일을 성공적으로 끝낸 것을 칭찬하거나 축하하는 대사를 한마디 해주세요.`;
                    } else {
                        prompt += `사용자가 "${todo.task}" 할 일을 끝내지 못했다고 답했습니다. 그를 위로하거나 다음을 격려하는 대사를 한마디 해주세요.`;
                    }
                    const result = await model.generateContent(prompt);
                    const response = await result.response;
                    const dialogue = response.text().trim().replace(/^"|"$/g, '');
                    await interaction.editReply({ content: '', embeds: [{ description: `"${dialogue}"` }], components: [] });
                    todos.delete(userId);
                }
            }
        }
        else if (interaction.isStringSelectMenu()) {
            await interaction.deferUpdate();
            const [type, durationMsStr, ...taskParts] = interaction.customId.split('_');
            const durationMs = parseInt(durationMsStr);
            const task = taskParts.join('_');

            if (type === 'character') {
                const selectedCharacterIdentifier = interaction.values[0];
                const userId = interaction.user.id;
                const channel = interaction.channel;
                const selectedCharacter = characters.find(char => char.value === selectedCharacterIdentifier);
                if (!selectedCharacter) {
                    return interaction.editReply({ content: '오류: 캐릭터 정보를 찾을 수 없습니다.', components: [] });
                }
                const webhook = await getOrCreateWebhook(interaction.channel);
                if (!webhook) {
                    return interaction.editReply({ content: '웹훅을 생성할 수 없어서 메시지를 보낼 수 없어요. 봇 권한을 확인해주세요.', components: [] });
                }

                // [새 기능] 실시간 타이머를 위한 마감 시간 계산
                const deadline = Date.now() + durationMs;
                const deadlineTimestamp = Math.floor(deadline / 1000);

                const hours = durationMs / 3600000;
                const displayHours = Number.isInteger(hours) ? `${hours}시간` : `${Math.floor(hours)}시간 ${Math.round((hours % 1) * 60)}분`;
                const prompt = `당신은 ${selectedCharacter.description} 이제부터 당신의 대사만 출력해야 합니다. 다른 부가 설명은 절대 넣지 마세요. 사용자에게 "${task}"라는 할 일을 ${displayHours} 안에 해달라고 부탁하는 대사를 한마디 해주세요.`;
                const result = await model.generateContent(prompt);
                const response = await result.response;
                const dialogue = response.text().trim().replace(/^"|"$/g, '');
                
                await interaction.editReply({ content: '캐릭터가 응원을 보냈습니다.', components: [] });

                await webhook.send({
                    content: `<@${userId}>`,
                    username: selectedCharacter.label,
                    avatarURL: selectedCharacter.avatarURL,
                    // [새 기능] 디스코드 타임스탬프를 embed 설명에 추가
                    embeds: [{ description: `"${dialogue}"\n\n**마감:** <t:${deadlineTimestamp}:R>` }]
                });

                // [새 기능] 랜덤 독촉 메시지 스케줄링
                const numberOfNags = Math.min(4, Math.floor(durationMs / (30 * 60 * 1000))); // 30분당 1회, 최대 4회
                const nagWindowStart = durationMs * 0.15; // 시작 후 15% 지점부터
                const nagWindowEnd = durationMs * 0.85; // 마감 15% 지점 전까지
                const nagWindowLength = nagWindowEnd - nagWindowStart;

                if (numberOfNags > 0) {
                    const segmentLength = nagWindowLength / numberOfNags;
                    for (let i = 0; i < numberOfNags; i++) {
                        const randomDelayInSegment = Math.random() * segmentLength;
                        const nagTimeoutDelay = nagWindowStart + (i * segmentLength) + randomDelayInSegment;

                        setTimeout(async () => {
                            const currentTodo = todos.get(userId);
                            if (!currentTodo || currentTodo.task !== task) return; // 작업이 이미 끝났으면 보내지 않음

                            const nagWebhook = await getOrCreateWebhook(channel);
                            if (nagWebhook) {
                                const nagPrompt = `당신은 ${selectedCharacter.description}입니다. 사용자는 현재 "${task}" 작업을 하는 중입니다. 작업 중간에 그를 격려하거나, 조언하거나, 관련된 농담을 하거나, 혹은 그냥 당신의 생각을 말하는 등, 캐릭터에 맞는 독촉 메시지를 한마디만 자연스럽게 보내주세요.`;
                                const nagResult = await model.generateContent(nagPrompt);
                                const nagResponse = await nagResult.response;
                                const nagDialogue = nagResponse.text().trim().replace(/^"|"$/g, '');
                                
                                await nagWebhook.send({
                                    username: selectedCharacter.label,
                                    avatarURL: selectedCharacter.avatarURL,
                                    embeds: [{ description: `"${nagDialogue}"` }]
                                });
                            }
                        }, nagTimeoutDelay);
                    }
                }


                const finalTimer = setTimeout(async () => {
                    const currentTodo = todos.get(userId);
                    if (currentTodo && currentTodo.task === task) {
                        const confirmationButtons = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`finish_yes_${userId}_${task}`).setLabel('네, 끝냈어요').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`finish_no_${userId}_${task}`).setLabel('아니오, 못했어요').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId(`finish_direct_${userId}_${task}`).setLabel('직접 입력').setStyle(ButtonStyle.Secondary));
                        const webhookForTimer = await getOrCreateWebhook(channel);
                        if(webhookForTimer) {
                            await webhookForTimer.send({ content: `<@${userId}>`, username: currentTodo.character.label, avatarURL: currentTodo.character.avatarURL, embeds: [{ description: `**"${task}"** 할 일은 다 하셨나요?` }], components: [confirmationButtons] });
                        }
                    }
                }, durationMs);

                todos.set(userId, { task: task, character: selectedCharacter, timer: finalTimer, channelId: channel.id });
            }
        }
        else if (interaction.isModalSubmit()) {
            await interaction.deferUpdate();
            const [type, action, userId, ...taskParts] = interaction.customId.split('_');
            const task = taskParts.join('_');
            if (type === 'modal' && action === 'submit') {
                const userInput = interaction.fields.getTextInputValue('reasonInput');
                const todo = todos.get(userId);
                if (!todo || todo.task !== task) {
                    return interaction.editReply({ content: '이미 처리되었거나 만료된 할 일입니다.', embeds: [], components: [] });
                }
                const prompt = `당신은 ${todo.character.description}라는 캐릭터입니다. 이제부터 당신의 대사만 출력해야 합니다. 다른 부가 설명은 절대 넣지 마세요. 사용자가 "${todo.task}" 할 일의 결과에 대해 "${userInput}" 라고 직접 입력했습니다. 사용자의 답변에 대해 캐릭터에 맞게 한마디 응답해주세요.`;
                const result = await model.generateContent(prompt);
                const response = await result.response;
                const dialogue = response.text().trim().replace(/^"|"$/g, '');
                await interaction.editReply({ content: '', embeds: [{ description: `"${dialogue}"` }], components: [] });
                todos.delete(userId);
            }
        }
    } catch (error) {
        console.error('상호작용 처리 중 오류 발생:', error);
        try {
            if (interaction && !interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '오류가 발생했습니다. 잠시 후 다시 시도해주세요.', ephemeral: true });
            } else if (interaction) {
                await interaction.followUp({ content: '오류가 발생했습니다. 잠시 후 다시 시도해주세요.', ephemeral: true });
            }
        } catch (e) {
            console.error("오류 응답을 보내는 데에도 실패했습니다:", e);
        }
    }
});

client.login(process.env.DISCORD_TOKEN);

const app = express();
const port = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Discord bot is alive!'));
app.listen(port, () => console.log(`Web server is listening on port ${port}.`));