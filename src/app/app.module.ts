import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FloatingChatModule } from '@shared/chat/floating-chat.module';
import { MainErrorModule } from '@shared/main-error/main-error.module';
import { ModalModule } from '@shared/modal/modal.module';
import { ThemeModule } from '@shared/theme/theme.module';
import { UtilModule } from '@shared/util/util.module';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { BookmarksModule } from './bookmarks/bookmarks.module';
import { ExploreModule } from './explore/explore.module';
import { MessagesModule } from './messages/messages.module';
import { NetworkModule } from './network/network.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ExploreSidebarModule } from './shared/explore-sidebar/explore-sidebar.module';
import { MenuSidebarModule } from './shared/menu-sidebar/menu-sidebar.module';
import { TimelineModule } from './timeline/timeline.module';

@NgModule({
  declarations: [
    AppComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,

    // pathed components
    TimelineModule,
    NotificationsModule,
    BookmarksModule,
    NetworkModule,
    MessagesModule,
    ExploreModule,

    //  shared
    MenuSidebarModule,
    ExploreSidebarModule,
    UtilModule,
    MainErrorModule,
    ThemeModule,
    FloatingChatModule,
    ModalModule
  ],
  bootstrap: [
    AppComponent
  ]
})
export class AppModule { }
