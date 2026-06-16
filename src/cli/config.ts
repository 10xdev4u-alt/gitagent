/**
 * `gitagent config` — show resolved configuration.
 */

export async function configCommand(): Promise<void> {
  const config = {
    version: '0.1.0',
    env: {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? '***set***' : '(not set)',
      OPENAI_API_KEY: process.env.OPENAI_API_KEY ? '***set***' : '(not set)',
      OPENAI_BASE_URL: process.env.OPENAI_BASE_URL ?? '(default: OpenAI)',
      GITHUB_TOKEN: process.env.GITHUB_TOKEN ? '***set***' : '(not set)',
      GITAGENT_WEBHOOK_SECRET: process.env.GITAGENT_WEBHOOK_SECRET ? '***set***' : '(not set)',
    },
    paths: {
      cwd: process.cwd(),
      agentsPath: '.github/agents',
    },
  };
  console.log(JSON.stringify(config, null, 2));
}
