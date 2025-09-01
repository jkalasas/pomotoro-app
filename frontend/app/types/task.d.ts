export interface Task {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  estimatedTime: number;
  createdAt: Date;
  order?: number;
}
