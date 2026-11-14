import { Global, Module } from "@nestjs/common";
import { CONFIG, type Config } from "../platform";
import { ADS_SOCKET } from "./ads";
import { AI_AGENT_SOCKET, AI_MEDIA_SOCKET, AI_TEXT_SOCKET, AI_VOICE_SOCKET } from "./ai";
import { CONVERSIONS_SOCKET } from "./conversions";
import { REALISTIC, systemClock } from "./core";
import { LEADS_SOCKET } from "./leads";
import { MESSAGING_SOCKET } from "./messaging";
import { AdsStandIn } from "./standins/ads.standin";
import { AiAgentStandIn, AiMediaStandIn, AiTextStandIn, AiVoiceStandIn } from "./standins/ai.standin";
import { ConversionsStandIn } from "./standins/conversions.standin";
import { LeadsStandIn } from "./standins/leads.standin";
import { MessagingStandIn } from "./standins/messaging.standin";

// Every socket is answered by its stand-in until Phase 6. Plugging in a real
// service means changing one `useFactory` below to build the real adapter;
// nothing that uses the socket changes, and the adapter must pass the same
// contract tests (apps/api/test/sockets).
const standIn = <T>(token: symbol, build: (chaos: typeof REALISTIC) => T) => ({
  provide: token,
  useFactory: (config: Config) => build(config.standInBehaviour === "realistic" ? REALISTIC : {}),
  inject: [CONFIG],
});

const providers = [
  standIn(ADS_SOCKET, (chaos) => new AdsStandIn(systemClock, chaos)),
  standIn(LEADS_SOCKET, (chaos) => new LeadsStandIn(systemClock, chaos)),
  standIn(MESSAGING_SOCKET, (chaos) => new MessagingStandIn(systemClock, chaos)),
  standIn(CONVERSIONS_SOCKET, (chaos) => new ConversionsStandIn(systemClock, chaos)),
  standIn(AI_TEXT_SOCKET, (chaos) => new AiTextStandIn(systemClock, chaos)),
  standIn(AI_MEDIA_SOCKET, (chaos) => new AiMediaStandIn(systemClock, chaos)),
  standIn(AI_VOICE_SOCKET, (chaos) => new AiVoiceStandIn(systemClock, chaos)),
  standIn(AI_AGENT_SOCKET, (chaos) => new AiAgentStandIn(systemClock, chaos)),
];

@Global()
@Module({ providers, exports: providers.map((p) => p.provide) })
export class SocketsModule {}
