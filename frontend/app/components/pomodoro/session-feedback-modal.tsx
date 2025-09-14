import { Save } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Textarea } from "~/components/ui/textarea";
import { cn } from "~/lib/utils";

export type FocusLevel = 
  | "HIGHLY_DISTRACTED" 
  | "DISTRACTED" 
  | "NEUTRAL" 
  | "FOCUSED" 
  | "HIGHLY_FOCUSED";

interface SessionFeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (focusLevel: FocusLevel, reflection?: string) => Promise<void>;
  sessionName: string;
  focusDuration: number;
  tasksCompleted: number;
  tasksTotal: number;
}

const focusOptions = [
  {
    level: "HIGHLY_DISTRACTED" as FocusLevel,
    emoji: "😞",
    label: "Highly Distracted",
    color: "text-red-600",
    bgColor: "bg-red-50 border-red-200 hover:bg-red-100",
  },
  {
    level: "DISTRACTED" as FocusLevel,
    emoji: "😕",
    label: "Distracted",
    color: "text-orange-600",
    bgColor: "bg-orange-50 border-orange-200 hover:bg-orange-100",
  },
  {
    level: "NEUTRAL" as FocusLevel,
    emoji: "😐",
    label: "Neutral",
    color: "text-gray-600",
    bgColor: "bg-gray-50 border-gray-200 hover:bg-gray-100",
  },
  {
    level: "FOCUSED" as FocusLevel,
    emoji: "😊",
    label: "Focused",
    color: "text-blue-600",
    bgColor: "bg-blue-50 border-blue-200 hover:bg-blue-100",
  },
  {
    level: "HIGHLY_FOCUSED" as FocusLevel,
    emoji: "😄",
    label: "Highly Focused",
    color: "text-green-600",
    bgColor: "bg-green-50 border-green-200 hover:bg-green-100",
  },
];

export function SessionFeedbackModal({
  isOpen,
  onClose,
  onSubmit,
  sessionName,
  focusDuration,
  tasksCompleted,
  tasksTotal,
}: SessionFeedbackModalProps) {
  const [selectedFocus, setSelectedFocus] = useState<FocusLevel | null>(null);
  const [reflection, setReflection] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!selectedFocus) return;
    
    setIsSubmitting(true);
    try {
      await onSubmit(selectedFocus, reflection.trim() || undefined);
      onClose();
      setSelectedFocus(null);
      setReflection("");
    } catch (error) {
      console.error("Failed to submit feedback:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md mx-auto">
        <div className="text-center p-6" style={{ backgroundColor: "#A0522D", color: "white" }}>
          <p className="text-sm opacity-90 mb-2">Let's pause and reflect</p>
          <h1 className="text-2xl font-bold mb-4">What have you learned in this session?</h1>
          
          {/* Focus Level Selection */}
          <div className="flex justify-center gap-3 mb-6">
            {focusOptions.map((option) => (
              <button
                key={option.level}
                onClick={() => setSelectedFocus(option.level)}
                className={cn(
                  "flex flex-col items-center p-3 rounded-lg border-2 transition-all group mb-4",
                  selectedFocus === option.level 
                    ? "border-white bg-white/20 scale-105" 
                    : "border-white/30 hover:border-white/50"
                )}
              >
                <span className="text-3xl mb-1 transition-transform duration-200 group-hover:scale-125">{option.emoji}</span>
                <span className="text-xs font-medium">{option.label}</span>
              </button>
            ))}
          </div>

          {/* Session Details */}
          <div className="grid grid-cols-3 gap-4 mb-6 text-sm">
            <div className="text-center">
              <p className="opacity-75">Focus Duration</p>
              <p className="font-semibold">{formatDuration(focusDuration)}</p>
            </div>
            <div className="text-center">
              <p className="opacity-75">Session Name</p>
              <p className="font-semibold">{sessionName}</p>
            </div>
            <div className="text-center">
              <p className="opacity-75">Number of Tasks</p>
              <p className="font-semibold">{tasksCompleted} completed | {tasksTotal - tasksCompleted} failed</p>
            </div>
          </div>

          {/* Reflection Textarea */}
          <div className="mb-6">
            <Textarea
              value={reflection}
              onChange={(e) => setReflection(e.target.value)}
              placeholder="Share your thoughts about this session..."
              className="bg-white/10 border-white/30 text-white placeholder:text-white/60 min-h-24"
              maxLength={500}
            />
          </div>

          {/* Submit Button */}
          <Button
            onClick={handleSubmit}
            disabled={!selectedFocus || isSubmitting}
            className="w-full bg-white/20 border border-white/30 hover:bg-white/30 text-white font-medium"
          >
            <Save className="w-4 h-4 mr-2" />
            {isSubmitting ? "Submitting..." : "Submit"}
          </Button>

          {/* Auto-submit countdown */}
          {!selectedFocus && (
            <p className="text-xs mt-4 opacity-75">
              00:20
              <br />
              Inactivity countdown to automatically submit session
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
