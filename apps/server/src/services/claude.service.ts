import { writeFile, unlink, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface ChatSong {
    id: string;
    name: string;
    artist: string;
    album?: string;
    cover?: string;
}

export interface ChatReply {
    say: string;
    reason?: string;
    play?: ChatSong[];
    segue?: string;
}

export interface PlanRequest {
    trigger: "manual" | "auto" | "scheduled";
    input?: string;
    maxSongs?: number;
    withDj?: boolean;
    scene?: string;
}

export interface PlanItem {
    type: "song" | "tts" | "silence";
    songId?: string;
    query?: string;
    text?: string;
    reason?: string;
    audioUrl?: string;
    durationMs?: number;
}

export interface PlanResponse {
    summary: string;
    scene: string;
    items: PlanItem[];
    segue?: string;
    memory?: Array<{ file: string; add: string }>;
}

export interface ClaudeService {
    generatePlan(request: PlanRequest, context: string): Promise<PlanResponse>;
    generatePlanStream(
        request: PlanRequest,
        context: string,
        onChunk: (text: string) => void
    ): Promise<PlanResponse>;
    generateChatReplyStream(
        message: string,
        context: string,
        onChunk: (text: string) => void,
        history?: Array<{ role: "user" | "assistant"; content: string }>
    ): Promise<ChatReply>;
}

export class MockClaudeService implements ClaudeService {
    async generatePlan(request: PlanRequest, _context: string): Promise<PlanResponse> {
        const songs = [
            { query: "轻音乐", reason: "适合当前放松场景" },
            { query: "钢琴曲", reason: "延续安静氛围" },
            { query: "爵士乐", reason: "增添一点情调" },
        ];

        const items: PlanItem[] = [];

        if (request.withDj) {
            items.push({
                type: "tts",
                text: "欢迎收听 AI 电台，接下来为你准备了几首好听的歌。",
                audioUrl: "",
            });
        }

        for (const song of songs.slice(0, request.maxSongs ?? 5)) {
            items.push({
                type: "song",
                query: song.query,
                reason: song.reason,
            });
        }

        return {
            summary: "已为你生成播放计划",
            scene: request.scene ?? "default",
            items,
        };
    }

    async generatePlanStream(
        request: PlanRequest,
        context: string,
        onChunk: (text: string) => void
    ): Promise<PlanResponse> {
        const result = await this.generatePlan(request, context);
        onChunk("好的，我来为你安排一个轻松的播放列表～\n\n这几首歌都很适合现在的氛围，希望你喜欢！");
        return result;
    }

    async generateChatReplyStream(
        _message: string,
        _context: string,
        onChunk: (text: string) => void,
        _history?: Array<{ role: "user" | "assistant"; content: string }>
    ): Promise<ChatReply> {
        const say = "好的，我来为你推荐几首歌～";
        onChunk(say);
        return {
            say,
            reason: "根据你的口味推荐",
            play: [
                { id: "mock_1", name: "晴天", artist: "周杰伦", album: "叶惠美" },
                { id: "mock_2", name: "稻香", artist: "周杰伦", album: "魔杰座" },
            ],
            segue: "接下来这首晴天，是很多人的青春回忆～",
        };
    }
}

interface ClaudeRawResponse {
    summary: string;
    scene: string;
    segue?: string;
    djLines?: Array<{ position: string; text: string }>;
    songs?: Array<{ query?: string; songId?: string; reason: string }>;
    memory?: Array<{ file: string; add: string }>;
}

export class ClaudeApiService implements ClaudeService {
    private apiKey: string;
    private baseUrl: string;
    private model: string;
    private systemPrompt: string;

    private chatSystemPrompt: string;

    constructor(config: { apiKey: string; baseUrl: string; model: string }, systemPrompt: string) {
        this.apiKey = config.apiKey;
        this.baseUrl = config.baseUrl;
        this.model = config.model;
        this.systemPrompt = systemPrompt;
        this.chatSystemPrompt = this.buildChatSystemPrompt();
    }

    private buildChatSystemPrompt(): string {
        return `你是 Claudio，用户的私人 AI 音乐助手和 DJ。

【你的能力】
- 你是一个懂音乐、有品味、有见识的朋友
- 你精通各种音乐风格：华语流行、欧美独立、日韩、电子、爵士、古典、摇滚、说唱等
- 你能根据用户的心情、场景、天气、时间段推荐最合适的歌曲
- 你也可以聊任何话题，不限于音乐——生活、科技、文化、情感都可以
- 你有幽默感，说话自然随意，像在跟朋友聊天

【回复规则】
1. 先理解用户说的话，自然地回应，然后根据情况推荐歌曲
2. 如果用户只是闲聊（不是要音乐），就正常聊天，不需要推荐歌曲
3. 推荐歌曲时，每首歌附带一句话理由，说说为什么选这首歌
4. 用中文回复，除非用户用英文跟你说话
5. 可以用 emoji 表达情绪，但不要过度
6. 不要用 Markdown 格式，纯文本即可
7. 不要说"以下是推荐"这种模板句，要像真人在说话

【输出格式】
当你需要推荐歌曲时，回复必须包含两部分：

1. **对话部分**（纯文本）：像真人一样聊天，介绍你推荐的歌，说说为什么选这些歌。这段话会实时流式展示给用户。
2. **计划部分**（JSON，放在回复末尾）：包含歌曲列表，用于系统执行。

在对话部分结束后，输出一个空行，然后输出 JSON 计划块：

\`\`\`json
{
  "summary": "一句话摘要",
  "scene": "场景标识",
  "play": [
    {"id": "", "name": "歌曲名", "artist": "艺术家", "reason": "推荐理由"}
  ],
  "segue": "你想语音播报给用户的内容"
}
\`\`\`

场景标识：morning | coding | relax | workout | sleep | focus | party | default

【示例】

用户：来点轻松的音乐

你的回复：
好嘞～现在这个时间正适合来点轻松的音乐放松一下 🎵

我给你挑了几首，第一首是久石让的《Summer》，这首钢琴曲特别治愈，旋律像夏天午后的微风一样舒服。然后是 Norah Jones 的《Don't Know Why》，她那种慵懒的嗓音配上爵士钢琴，听着就让人想窝在沙发里。最后来一首陈绮贞的《旅行的意义》，清新又有点小文艺，很适合发呆的时候听 ☁️

\`\`\`json
{
  "summary": "轻松治愈系歌单",
  "scene": "relax",
  "play": [
    {"id": "", "name": "Summer", "artist": "久石让", "reason": "治愈系钢琴曲，适合放松"},
    {"id": "", "name": "Don't Know Why", "artist": "Norah Jones", "reason": "慵懒爵士，窝沙发必备"},
    {"id": "", "name": "旅行的意义", "artist": "陈绮贞", "reason": "清新文艺，适合发呆"}
  ],
  "segue": "接下来这首《Summer》是久石让的经典之作，每次听到都像被阳光包围，希望也能治愈你此刻的心情～"
}
\`\`\`

【注意事项】
- 歌曲搜索关键词要具体到歌手+歌名，方便精确匹配
- 每次推荐 3-8 首歌
- segue 是会被 TTS 朗读出来的文字，像电台主持人一样自然
- 如果用户只是聊天没有要音乐，只输出对话部分，不需要 JSON 块`;
    }

    async generatePlan(request: PlanRequest, context: string): Promise<PlanResponse> {
        const userMessage = this.buildUserMessage(request, context);
        let rawResponse: ClaudeRawResponse | null = null;

        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const response = await this.callClaude(
                    attempt === 0 ? userMessage : `${userMessage}\n\n请只返回 JSON，不要添加任何其他文字。`
                );
                console.log("[claude] Raw response:", response.substring(0, 200));
                rawResponse = this.extractJson(response);
                if (rawResponse) {
                    console.log("[claude] Parsed JSON:", JSON.stringify(rawResponse).substring(0, 200));
                    break;
                }
            } catch (err) {
                console.error("[claude] Attempt", attempt, "failed:", err);
                if (attempt === 1) break;
            }
        }

        if (!rawResponse) {
            return {
                summary: "AI 生成失败，使用默认计划",
                scene: request.scene ?? "default",
                items: this.fallbackItems(request),
            };
        }

        return this.transformResponse(rawResponse, request);
    }

    /**
     * Streaming version: calls Claude API with stream=true, forwards text chunks
     * via onChunk callback in real-time, then parses the final JSON plan.
     */
    async generatePlanStream(
        request: PlanRequest,
        context: string,
        onChunk: (text: string) => void
    ): Promise<PlanResponse> {
        const userMessage = this.buildUserMessage(request, context);
        let fullText = "";

        try {
            fullText = await this.callClaudeStream(userMessage, onChunk);
        } catch (err) {
            console.error("[claude-stream] Streaming failed, falling back to sync:", err);
            return this.generatePlan(request, context);
        }

        // Parse the JSON plan from the accumulated text
        const rawResponse = this.extractJson(fullText);

        if (!rawResponse) {
            // If no JSON found, the entire response is conversational text
            // Return a fallback plan
            console.warn("[claude-stream] No JSON plan found in response");
            return {
                summary: fullText || "已为你生成播放计划",
                scene: request.scene ?? "default",
                items: this.fallbackItems(request),
            };
        }

        return this.transformResponse(rawResponse, request);
    }

    private async callClaudeStream(
        userMessage: string,
        onChunk: (text: string) => void
    ): Promise<string> {
        const url = `${this.baseUrl}/chat/completions`;

        const bodyObj = {
            model: this.model,
            max_tokens: 4096,
            stream: true,
            messages: [
                { role: "system", content: this.systemPrompt },
                { role: "user", content: userMessage }
            ],
        };

        const tmpFile = join(tmpdir(), `claude-stream-${Date.now()}.json`);
        await writeFile(tmpFile, JSON.stringify(bodyObj), "utf-8");

        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify(bodyObj),
                signal: AbortSignal.timeout(120000),
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`API Error ${response.status}: ${errText.substring(0, 200)}`);
            }

            const reader = response.body?.getReader();
            if (!reader) throw new Error("No response body");

            const decoder = new TextDecoder();
            let buffer = "";
            let fullText = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() ?? "";

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith("data:")) continue;

                    const data = trimmed.slice(5).trim();
                    if (data === "[DONE]") continue;

                    try {
                        const event = JSON.parse(data);
                        const content = event.choices?.[0]?.delta?.content;
                        if (content) {
                            fullText += content;
                            onChunk(content);
                        }
                    } catch {
                        // Skip unparseable lines
                    }
                }
            }

            return fullText;
        } finally {
            await unlink(tmpFile).catch(() => {});
        }
    }

    private buildUserMessage(request: PlanRequest, context: string): string {
        const parts = [context];
        if (request.input) parts.push(`用户输入：${request.input}`);
        if (request.scene) parts.push(`当前场景：${request.scene}`);
        parts.push(`需要歌曲数量：${request.maxSongs ?? 8}`);
        parts.push(`是否需要 DJ 串词：${request.withDj ? "是" : "否"}`);
        return parts.join("\n\n");
    }

    private async callClaude(userMessage: string): Promise<string> {
        const maxRetries = 3;
        let lastError: Error | null = null;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const bodyStr = JSON.stringify({
                    model: this.model,
                    max_tokens: 4096,
                    messages: [
                        { role: "system", content: this.systemPrompt },
                        { role: "user", content: userMessage }
                    ],
                });

                const tmpFile = join(tmpdir(), `claude-body-${Date.now()}-${attempt}.json`);
                await writeFile(tmpFile, bodyStr, "utf-8");

                try {
                    const url = `${this.baseUrl}/chat/completions`;
                    console.log(`[mimo] Attempt ${attempt + 1}: POST ${url}, key=${this.apiKey.substring(0, 8)}...`);

                    const response = await fetch(url, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${this.apiKey}`,
                        },
                        body: bodyStr,
                        signal: AbortSignal.timeout(65000),
                    });

                    if (!response.ok) {
                        const errText = await response.text();
                        throw new Error(`API Error ${response.status}: ${errText.substring(0, 200)}`);
                    }

                    const parsed = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
                    return parsed?.choices?.[0]?.message?.content ?? "";
                } finally {
                    await unlink(tmpFile).catch(() => {});
                }
            } catch (err) {
                lastError = err as Error;
                console.error(`[mimo] Attempt ${attempt + 1}/${maxRetries} failed:`, (err as Error).message);
                if (attempt < maxRetries - 1) {
                    await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
                }
            }
        }

        throw lastError || new Error("API failed after all retries");
    }

    private extractJson(text: string): ClaudeRawResponse | null {
        try {
            return JSON.parse(text) as ClaudeRawResponse;
        } catch {}

        const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (match?.[1]) {
            try {
                return JSON.parse(match[1].trim()) as ClaudeRawResponse;
            } catch {}
        }

        const start = text.indexOf("{");
        const end = text.lastIndexOf("}");
        if (start >= 0 && end > start) {
            try {
                return JSON.parse(text.slice(start, end + 1)) as ClaudeRawResponse;
            } catch {}
        }

        return null;
    }

    private transformResponse(raw: ClaudeRawResponse, request: PlanRequest): PlanResponse {
        const items: PlanItem[] = [];

        if (request.withDj && raw.djLines) {
            for (const line of raw.djLines) {
                items.push({
                    type: "tts",
                    text: line.text,
                });
            }
        }

        if (raw.songs) {
            for (const song of raw.songs.slice(0, request.maxSongs ?? 8)) {
                items.push({
                    type: "song",
                    query: song.query,
                    reason: song.reason,
                });
            }
        }

        return {
            summary: raw.summary ?? "已生成播放计划",
            scene: raw.scene ?? request.scene ?? "default",
            items,
            segue: raw.segue,
            memory: raw.memory,
        };
    }

    private fallbackItems(request: PlanRequest): PlanItem[] {
        const items: PlanItem[] = [];
        if (request.withDj) {
            items.push({ type: "tts", text: "欢迎收听 AI 电台" });
        }
        items.push({ type: "song", query: "轻音乐", reason: "默认推荐" });
        items.push({ type: "song", query: "钢琴曲", reason: "默认推荐" });
        return items;
    }

    async generateChatReplyStream(
        message: string,
        context: string,
        onChunk: (text: string) => void,
        history?: Array<{ role: "user" | "assistant"; content: string }>
    ): Promise<ChatReply> {
        // Build chat system prompt with agent.md if available
        let systemPrompt = this.chatSystemPrompt;
        try {
            const configDir = join(__dirname, "../../../config");
            const agentPath = join(configDir, "agent.md");
            if (existsSync(agentPath)) {
                const agentMd = await readFile(agentPath, "utf-8");
                systemPrompt = `${agentMd}\n\n${systemPrompt}`;
            }
        } catch {}

        const userMessage = context ? `${context}\n\n用户说：${message}` : message;

        // Stream the response with chat history
        const fullText = await this.callChatStream(userMessage, systemPrompt, onChunk, history);

        // Try to parse structured JSON reply
        const parsed = this.extractChatReply(fullText);
        if (parsed) {
            return parsed;
        }

        // Fallback: treat entire text as `say`
        return { say: fullText || "好的，收到~" };
    }

    private async callChatStream(
        userMessage: string,
        systemPrompt: string,
        onChunk: (text: string) => void,
        history?: Array<{ role: "user" | "assistant"; content: string }>
    ): Promise<string> {
        const url = `${this.baseUrl}/chat/completions`;

        const messages: Array<{ role: string; content: string }> = [
            { role: "system", content: systemPrompt },
        ];

        // Add chat history (last 10 messages)
        if (history && history.length > 0) {
            for (const msg of history.slice(-10)) {
                messages.push({ role: msg.role, content: msg.content });
            }
        }

        messages.push({ role: "user", content: userMessage });

        const bodyObj = {
            model: this.model,
            max_tokens: 4096,
            stream: true,
            messages,
        };

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify(bodyObj),
            signal: AbortSignal.timeout(120000),
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`API Error ${response.status}: ${errText.substring(0, 200)}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";
        let fullText = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith("data:")) continue;

                const data = trimmed.slice(5).trim();
                if (data === "[DONE]") continue;

                try {
                    const event = JSON.parse(data);
                    const content = event.choices?.[0]?.delta?.content;
                    if (content) {
                        fullText += content;
                        onChunk(content);
                    }
                } catch {
                    // Skip unparseable lines
                }
            }
        }

        return fullText;
    }

    private extractChatReply(text: string): ChatReply | null {
        // Try direct JSON parse
        try {
            const obj = JSON.parse(text) as ChatReply;
            if (obj.say) return obj;
        } catch {}

        // Try code block
        const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (match?.[1]) {
            try {
                const obj = JSON.parse(match[1].trim()) as ChatReply;
                if (obj.say) return obj;
            } catch {}
        }

        // Try to find JSON object in text
        const start = text.indexOf("{");
        const end = text.lastIndexOf("}");
        if (start >= 0 && end > start) {
            try {
                const obj = JSON.parse(text.slice(start, end + 1)) as ChatReply;
                if (obj.say) return obj;
            } catch {}
        }

        return null;
    }
}
