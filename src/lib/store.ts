// Simple in-memory store for current day's slate
interface SlateData {
  date: string;
  content: string;
  timestamp: number;
}

let currentSlate: SlateData | null = null;

export function saveSlate(content: string): void {
  const today = new Date().toLocaleDateString('en-US', { 
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' 
  });
  currentSlate = {
    date: today,
    content,
    timestamp: Date.now()
  };
  console.log('[STORE] Slate saved for', today);
}

export function getSlate(): SlateData | null {
  if (!currentSlate) return null;
  
  // Check if slate is from today (within 24 hours)
  const isRecent = Date.now() - currentSlate.timestamp < 24 * 60 * 60 * 1000;
  if (!isRecent) {
    console.log('[STORE] Slate expired');
    return null;
  }
  
  return currentSlate;
}

export function getSlateContext(): string {
  const slate = getSlate();
  if (!slate) return "";
  return `\n\nCURRENT SLATE (${slate.date}):\n${slate.content}`;
}
