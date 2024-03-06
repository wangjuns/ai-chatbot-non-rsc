import { kv } from '@vercel/kv'
import { OpenAIStream, StreamingTextResponse } from 'ai'

import { auth } from '@/auth'
import { nanoid } from '@/lib/utils'
import { AzureKeyCredential, OpenAIClient } from '@azure/openai'


export const runtime = 'edge'

const client = new OpenAIClient(
  process.env.AZURE_OPENAI_ENDPOINT!,
  new AzureKeyCredential(process.env.AZURE_OPENAI_KEY!),
);

export async function POST(req: Request) {
  const json = await req.json()
  const { messages, previewToken } = json
  const session = await auth();
  // console.log(session)

  const userId = session?.user.id

  if (!userId) {
    return new Response('Unauthorized', {
      status: 401
    })
  }

  // if (previewToken) {
  //   openai.apiKey = previewToken
  // }
  const deploymentId = process.env.AZURE_OPENAI_DEPLOYMENT_ID!;


  const response = await client.streamChatCompletions(
    deploymentId,
    messages,
  );

  // @ts-expect-error type is ok
  const stream = OpenAIStream(response, {
    async onCompletion(completion) {
      const title = json.messages[0].content.substring(0, 100)
      const id = json.id ?? nanoid()
      const createdAt = Date.now()
      const path = `/chat/${id}`
      const payload = {
        id,
        title,
        userId,
        createdAt,
        path,
        messages: [
          ...messages,
          {
            content: completion,
            role: 'assistant'
          }
        ]
      }
      await kv.hmset(`chat:${id}`, payload)
      await kv.zadd(`user:chat:${userId}`, {
        score: createdAt,
        member: `chat:${id}`
      })
    }
  })

  return new StreamingTextResponse(stream)
}
