import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";

import type { GatewayRealtimeSession, GatewayRealtimeSessionApi } from "./gateway-runner.js";

type WakeHandler = () => Promise<void>;

/**
 * Receives a private, data-free "command ready" event. The event itself never
 * includes a Home-Assistant action; the existing server-side claim RPC remains
 * the sole authority for the actual command.
 */
export class HomeAssistantGatewayRealtime {
  private channel: RealtimeChannel | null = null;
  private client: SupabaseClient | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(
    private readonly sessionApi: GatewayRealtimeSessionApi,
    private readonly onWake: WakeHandler,
    private readonly report: (message: string) => void = console.error
  ) {}

  async start(): Promise<void> {
    this.stopped = false;
    await this.connect();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.refreshTimer = null;
    this.reconnectTimer = null;
    if (this.client && this.channel) await this.client.removeChannel(this.channel);
    this.channel = null;
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    try {
      const session = await this.sessionApi.realtimeSession();
      await this.replaceChannel(session);
      this.scheduleRefresh(session.expiresAt);
    } catch (error) {
      this.report(error instanceof Error ? error.message : "Die sichere Echtzeitverbindung ist nicht erreichbar.");
      this.scheduleReconnect();
    }
  }

  private async replaceChannel(session: GatewayRealtimeSession): Promise<void> {
    if (this.client && this.channel) await this.client.removeChannel(this.channel);
    this.client = createClient(session.supabaseUrl, session.publishableKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false }
    });
    await this.client.realtime.setAuth(session.accessToken);
    const topic = `home-gateway:${session.gatewayId}:commands`;
    this.channel = this.client
      .channel(topic, { config: { private: true } })
      .on("broadcast", { event: "command_ready" }, () => {
        void this.onWake().catch((error: unknown) => this.report(error instanceof Error ? error.message : "Der Green-Gateway konnte einen Auftrag nicht abrufen."));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") return;
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          this.report("Die sichere Echtzeitverbindung des Green-Gateways ist unterbrochen.");
          this.scheduleReconnect();
        }
      });
  }

  private scheduleRefresh(expiresAtSeconds: number): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    const wait = Math.max(60_000, (expiresAtSeconds * 1_000) - Date.now() - 60_000);
    this.refreshTimer = setTimeout(() => { void this.connect(); }, wait);
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, 60_000);
  }
}
