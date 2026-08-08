import { HomeAssistantEntityClient, HomeAssistantPilotClient, validateGatewayConfig } from "./home-assistant-client.js";
import { HomeAssistantEntityRunner, HomeAssistantGatewayRunner, HttpGatewayCommandApi } from "./gateway-runner.js";
import { HomeAssistantGatewayRealtime } from "./gateway-realtime.js";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} ist nicht konfiguriert.`);
  return value;
}

const homeAssistant = new HomeAssistantPilotClient(validateGatewayConfig({
  accessToken: required("HOME_ASSISTANT_ACCESS_TOKEN"),
  baseUrl: required("HOME_ASSISTANT_URL"),
  pilotEntityId: required("HOME_ASSISTANT_PILOT_ENTITY_ID")
}));
const gateway = new HomeAssistantGatewayRunner(
  new HttpGatewayCommandApi({ gatewayKey: required("HOEBBIE_GATEWAY_KEY"), gatewayUrl: required("HOEBBIE_GATEWAY_URL") }),
  homeAssistant
);
const entityRunner = new HomeAssistantEntityRunner(
  new HttpGatewayCommandApi({ gatewayKey: required("HOEBBIE_GATEWAY_KEY"), gatewayUrl: required("HOEBBIE_GATEWAY_URL") }),
  new HomeAssistantEntityClient({ accessToken: required("HOME_ASSISTANT_ACCESS_TOKEN"), baseUrl: required("HOME_ASSISTANT_URL") })
);

let draining = false;
const maximumCommandsPerWake = 24;

async function drainCommands(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    for (let attempt = 0; attempt < maximumCommandsPerWake; attempt += 1) {
      const pilot = await gateway.runOnce().catch((error: unknown) => {
        // Es werden nie Zugangsdaten oder Home-Assistant-Antworten ausgegeben.
        console.error(error instanceof Error ? error.message : "Der Green-Gateway ist fehlgeschlagen.");
        return "idle" as const;
      });
      const entity = await entityRunner.runOnce().catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : "Der Green-Gateway ist fehlgeschlagen.");
        return "idle" as const;
      });
      if (pilot === "idle" && entity === "idle") return;
    }
    console.error("Der Green-Gateway hat die Auftragsgrenze erreicht und wartet auf das nächste sichere Wecksignal.");
  } finally {
    draining = false;
  }
}

const realtime = new HomeAssistantGatewayRealtime(
  new HttpGatewayCommandApi({ gatewayKey: required("HOEBBIE_GATEWAY_KEY"), gatewayUrl: required("HOEBBIE_GATEWAY_URL") }),
  drainCommands
);

void realtime.start().catch((error: unknown) => {
  // Es werden nie Zugangsdaten oder Home-Assistant-Antworten ausgegeben.
  console.error(error instanceof Error ? error.message : "Die sichere Echtzeitverbindung ist nicht erreichbar.");
});

// Ein seltener Abgleich fängt ein Ereignis ab, das während eines Netzwerk- oder
// Realtime-Ausfalls verloren ging. Er ist keine Steuerung und kein Dauerpolling.
void drainCommands();
setInterval(() => { void drainCommands(); }, 5 * 60_000);
