/** Sirena local opcional: sólo se habilita por interacción explícita del usuario. */
export class Siren {
  private context: AudioContext | null = null;
  private carrier: OscillatorNode | null = null;
  private modulation: OscillatorNode | null = null;
  private output: GainNode | null = null;
  private modulationGain: GainNode | null = null;

  async unlock(): Promise<void> {
    this.context ??= new AudioContext();
    await this.context.resume();
  }

  start(): void {
    if (!this.context || this.carrier) return;
    this.carrier = this.context.createOscillator();
    this.carrier.type = 'sine';
    this.carrier.frequency.value = 790;
    this.modulation = this.context.createOscillator();
    this.modulation.type = 'sine';
    this.modulation.frequency.value = 1.7;
    this.modulationGain = this.context.createGain();
    this.modulationGain.gain.value = 190;
    this.modulation.connect(this.modulationGain);
    this.modulationGain.connect(this.carrier.frequency);
    this.output = this.context.createGain();
    this.output.gain.value = 0.045;
    this.carrier.connect(this.output);
    this.output.connect(this.context.destination);
    this.carrier.start();
    this.modulation.start();
  }

  silence(): void {
    this.carrier?.stop();
    this.modulation?.stop();
    this.carrier?.disconnect();
    this.modulation?.disconnect();
    this.modulationGain?.disconnect();
    this.output?.disconnect();
    this.carrier = this.modulation = null;
    this.modulationGain = this.output = null;
  }

  async dispose(): Promise<void> {
    this.silence();
    if (this.context) await this.context.close();
    this.context = null;
  }
}
