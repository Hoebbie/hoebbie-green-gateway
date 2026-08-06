import { HomeAssistantEntityClient, HomeAssistantPilotClient, validateGatewayConfig } from "./home-assistant-client.js";
import { HomeAssistantEntityRunner, HomeAssistantGatewayRunner, HttpGatewayCommandApi } from "./gateway-runner.js";

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

const pollingIntervalMilliseconds = 2_000;
async function poll(): Promise<void> {
  await gateway.runOnce().catch((error: unknown) => {
    // Es werden nie Zugangsdaten oder Home-Assistant-Antworten ausgegeben.
    console.error(error instanceof Error ? error.message : "Der Green-Gateway ist fehlgeschlagen.");
  });
  await entityRunner.runOnce().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Der Green-Gateway ist fehlgeschlagen.");
  });
}

void poll();
setInterval(() => { void poll(); }, pollingIntervalMilliseconds);
