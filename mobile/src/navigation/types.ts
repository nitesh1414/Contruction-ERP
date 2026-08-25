import type { NavigatorScreenParams } from '@react-navigation/native';

export type MainTabParamList = {
  Home: undefined;
  Progress: undefined;
  Attendance: undefined;
  Issues: undefined;
  More: undefined;
};

export type RootStackParamList = {
  Login: undefined;
  Main: NavigatorScreenParams<MainTabParamList>;
  ProgressCapture: { projectId?: number } | undefined;
  ProgressDetail: { id: number };
  IssueCreate: { projectId?: number } | undefined;
  IssueDetail: { id: number };
  Inspections: undefined;
  InspectionDetail: { id: number };
  SyncQueue: undefined;
  Notifications: undefined;
};
