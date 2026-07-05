/**
 * EventPanel.js — AI 识别结果与实时事件列表组件
 * 本次修改：从 UIManager.js 拆出右侧事件类列表 DOM 构建。
 */

import { makeCard } from './helpers.js';

export class EventPanel {
    init(parent) {
        const aiResultCard = makeCard('AI 识别结果');
        const aiList = document.createElement('div');
        aiList.className = 'ui-list';
        aiList.id = 'ai-results-list';
        aiResultCard.body.appendChild(aiList);
        parent.appendChild(aiResultCard.root);

        const eventCard = makeCard('实时事件');
        const eventList = document.createElement('div');
        eventList.className = 'ui-list';
        eventList.id = 'event-list';
        eventCard.body.appendChild(eventList);
        parent.appendChild(eventCard.root);

        return { aiResultsList: aiList, eventList };
    }
}

export default EventPanel;
