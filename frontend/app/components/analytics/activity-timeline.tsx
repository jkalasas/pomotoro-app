import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { ScrollArea } from '~/components/ui/scroll-area';
import { Badge } from '~/components/ui/badge';
import { LogoIcon } from '~/components/ui/logo';
import type { AnalyticsEvent } from '~/lib/analytics';

interface ActivityTimelineProps {
  events: AnalyticsEvent[];
}

export function ActivityTimeline({ events }: ActivityTimelineProps) {
  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case 'session_start':
        return '🎯';
      case 'session_switch':
        return '🔄';
      case 'task_complete':
        return '✅';
      case 'pomodoro_complete':
        return <LogoIcon />;
      case 'break_start':
        return '☕';
      case 'break_skip':
        return '⏭️';
      case 'timer_start':
        return '▶️';
      case 'timer_pause':
        return '⏸️';
      default:
        return '📊';
    }
  };

  const getEventColor = (eventType: string) => {
    switch (eventType) {
      case 'session_start':
      case 'timer_start':
        return 'default';
      case 'task_complete':
      case 'pomodoro_complete':
        return 'default';
      case 'session_switch':
        return 'secondary';
      case 'timer_pause':
        return 'destructive';
      case 'break_start':
        return 'secondary';
      case 'break_skip':
        return 'secondary';
      default:
        return 'secondary';
    }
  };

  const formatEventName = (eventType: string) => {
    return eventType
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const formatEventTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const parseEventData = (eventData: string | null) => {
    if (!eventData) return null;
    try {
      return JSON.parse(eventData);
    } catch {
      return null;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
        <CardDescription>
          Your latest productivity events and milestones
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          <div className="space-y-4">
            {events.map((event) => {
              const eventData = parseEventData(event.event_data);
              return (
                <div key={event.id} className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm">
                      {getEventIcon(event.event_type)}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <Badge variant={getEventColor(event.event_type)}>
                        {formatEventName(event.event_type)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatEventTime(event.created_at)}
                      </span>
                    </div>
                    {eventData && (
                      <div className="mt-1 text-sm text-muted-foreground">
                        {event.event_type === 'task_complete' && eventData.task_name && (
                          <span>Completed: {eventData.task_name}</span>
                        )}
                        {event.event_type === 'session_start' && eventData.session_name && (
                          <span>Started: {eventData.session_name}</span>
                        )}
                        {event.event_type === 'pomodoro_complete' && eventData.pomodoros_completed && (
                          <span>Pomodoro #{eventData.pomodoros_completed} completed</span>
                        )}
                        {event.event_type === 'break_start' && eventData.break_type && (
                          <span>Started {eventData.break_type.replace('_', ' ')}</span>
                        )}
                        {event.event_type === 'break_skip' && (
                          <span>
                            Skipped{eventData.break_type ? ` ${eventData.break_type.replace('_', ' ')}` : ' break'}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {events.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <p>No recent activity</p>
                <p className="text-sm">Start a pomodoro session to see your activity here!</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
