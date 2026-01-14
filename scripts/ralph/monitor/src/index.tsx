import React, { useState, useEffect } from 'react';
import { render, Box, Text, useApp, useInput } from 'ink';
import { readFileSync, existsSync, watchFile, unwatchFile } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

const WORK_DIR = process.argv[2] || process.cwd();
const TASKS_DIR = join(WORK_DIR, 'tasks');
const PRD_FILE = join(TASKS_DIR, 'prd.json');
const PROGRESS_FILE = join(TASKS_DIR, 'progress.txt');
const ACTIVITY_FILE = join(TASKS_DIR, 'activity.log');

interface Story {
  id: string;
  title: string;
  status?: string;
  passes?: boolean;
  startedAt?: number;
  completedAt?: number;
}

interface PRD {
  title?: string;
  userStories: Story[];
}

interface Activity {
  timestamp: string;
  storyId: string;
  action: string;
  message: string;
}

function parseActivity(line: string): Activity | null {
  const match = line.match(/\[([^\]]+)\] \[([^\]]+)\] \[([^\]]+)\] (.+)/);
  if (!match) return null;
  return {
    timestamp: match[1],
    storyId: match[2],
    action: match[3],
    message: match[4],
  };
}

function getStoryStatus(story: Story): 'done' | 'in_progress' | 'open' {
  if (story.status === 'done' || story.passes === true) return 'done';
  if (story.status === 'in_progress') return 'in_progress';
  return 'open';
}

function ProgressBar({ completed, total, width = 30 }: { completed: number; total: number; width?: number }) {
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const filled = total > 0 ? Math.round((completed / total) * width) : 0;
  const empty = width - filled;

  return (
    <Text>
      <Text color="green">{'█'.repeat(filled)}</Text>
      <Text color="gray">{'░'.repeat(empty)}</Text>
      <Text> {completed}/{total} ({percent}%)</Text>
    </Text>
  );
}

function Header({ title }: { title: string }) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color="cyan" bold>
        ╔═══════════════════════════════════════════════════════════╗
      </Text>
      <Text color="cyan" bold>
        ║  RALPH MONITOR - {title.substring(0, 40).padEnd(40)}║
      </Text>
      <Text color="cyan" bold>
        ╚═══════════════════════════════════════════════════════════╝
      </Text>
    </Box>
  );
}

function StoryItem({ story, isCurrent }: { story: Story; isCurrent?: boolean }) {
  const status = getStoryStatus(story);
  const statusIcon = status === 'done' ? '✓' : status === 'in_progress' ? '►' : '○';
  const statusColor = status === 'done' ? 'green' : status === 'in_progress' ? 'yellow' : 'gray';

  return (
    <Box>
      <Text color={statusColor}>{statusIcon} </Text>
      <Text color={isCurrent ? 'cyan' : undefined} bold={isCurrent}>
        {story.id}
      </Text>
      <Text color="gray"> - </Text>
      <Text>{story.title.substring(0, 50)}{story.title.length > 50 ? '...' : ''}</Text>
    </Box>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color="blue" bold>── {title} ──</Text>
      <Box flexDirection="column" paddingLeft={1}>
        {children}
      </Box>
    </Box>
  );
}

function ActivityItem({ activity }: { activity: Activity }) {
  const actionColor =
    activity.action === 'completed' ? 'green' :
    activity.action === 'started' ? 'yellow' :
    activity.action === 'reset' ? 'red' : 'gray';

  return (
    <Box>
      <Text color="gray">{activity.timestamp.split(' ')[1]} </Text>
      <Text color="cyan">[{activity.storyId}] </Text>
      <Text color={actionColor}>{activity.action}: </Text>
      <Text>{activity.message.substring(0, 40)}</Text>
    </Box>
  );
}

function App() {
  const { exit } = useApp();
  const [prd, setPrd] = useState<PRD | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [commits, setCommits] = useState<string[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [error, setError] = useState<string | null>(null);

  const loadData = () => {
    try {
      if (existsSync(PRD_FILE)) {
        const content = readFileSync(PRD_FILE, 'utf-8');
        setPrd(JSON.parse(content));
      } else {
        setError(`PRD not found: ${PRD_FILE}`);
      }

      if (existsSync(ACTIVITY_FILE)) {
        const content = readFileSync(ACTIVITY_FILE, 'utf-8');
        const lines = content.trim().split('\n').filter(Boolean);
        const parsed = lines.map(parseActivity).filter((a): a is Activity => a !== null);
        setActivities(parsed.slice(-5).reverse());
      }

      try {
        const gitLog = execSync('git log --oneline -5', {
          cwd: WORK_DIR,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe']
        });
        setCommits(gitLog.trim().split('\n').filter(Boolean));
      } catch {
        setCommits([]);
      }

      setLastUpdate(new Date());
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  };

  useEffect(() => {
    loadData();

    const interval = setInterval(loadData, 2000);

    const filesToWatch = [PRD_FILE, ACTIVITY_FILE];
    filesToWatch.forEach(file => {
      if (existsSync(file)) {
        watchFile(file, { interval: 1000 }, loadData);
      }
    });

    return () => {
      clearInterval(interval);
      filesToWatch.forEach(file => {
        if (existsSync(file)) {
          unwatchFile(file);
        }
      });
    };
  }, []);

  useInput((input, key) => {
    if (input === 'q' || key.escape) {
      exit();
    }
    if (input === 'r') {
      loadData();
    }
  });

  if (error && !prd) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red" bold>Error: {error}</Text>
        <Text color="gray">Working dir: {WORK_DIR}</Text>
        <Text color="gray">Press 'q' to quit, 'r' to retry</Text>
      </Box>
    );
  }

  if (!prd) {
    return (
      <Box padding={1}>
        <Text color="yellow">Loading...</Text>
      </Box>
    );
  }

  const stories = prd.userStories || [];
  const completed = stories.filter(s => getStoryStatus(s) === 'done').length;
  const inProgress = stories.find(s => getStoryStatus(s) === 'in_progress');
  const pending = stories.filter(s => getStoryStatus(s) === 'open');
  const total = stories.length;

  return (
    <Box flexDirection="column" padding={1}>
      <Header title={prd.title || 'Ralph Session'} />

      <Section title="Progress">
        <ProgressBar completed={completed} total={total} width={40} />
        {inProgress && (
          <Box marginTop={1}>
            <Text color="yellow">► Current: </Text>
            <Text color="cyan" bold>{inProgress.id}</Text>
            <Text> - {inProgress.title}</Text>
          </Box>
        )}
      </Section>

      <Section title={`Pending Stories (${pending.length})`}>
        {pending.length === 0 ? (
          <Text color="green">All stories completed!</Text>
        ) : (
          pending.slice(0, 5).map(story => (
            <StoryItem key={story.id} story={story} />
          ))
        )}
        {pending.length > 5 && (
          <Text color="gray">  ... and {pending.length - 5} more</Text>
        )}
      </Section>

      <Section title="Recent Activity">
        {activities.length === 0 ? (
          <Text color="gray">No activity yet</Text>
        ) : (
          activities.map((activity, i) => (
            <ActivityItem key={i} activity={activity} />
          ))
        )}
      </Section>

      <Section title="Recent Commits">
        {commits.length === 0 ? (
          <Text color="gray">No commits yet</Text>
        ) : (
          commits.slice(0, 3).map((commit, i) => (
            <Text key={i} color="green">  {commit}</Text>
          ))
        )}
      </Section>

      <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text color="gray">
          Last update: {lastUpdate.toLocaleTimeString()} | Press 'q' to quit, 'r' to refresh
        </Text>
      </Box>
    </Box>
  );
}

render(<App />);
