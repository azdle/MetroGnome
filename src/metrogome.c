#include <pebble.h>

#define ANIMATED  true
#define NOT_ANIMATED false


// Temporary Decelerations Until Everything gets Split into Files

#define MAX_STOP_LIST_ITEMS (10)
#define MAX_STOP_LOCATION_LENGTH (64)
#define MAX_STOP_ROUTES_LENGTH (64)

typedef struct {
	int site_id;
	char location[MAX_STOP_LOCATION_LENGTH];
	char routes[MAX_STOP_ROUTES_LENGTH];
	bool is_favorite;
} StopItem;

static void handle_stops_message(DictionaryIterator*);
static void handle_times_message(DictionaryIterator*);

static StopItem* get_stop_list_item_at_index(int index);
static void init_stop_times(StopItem* stop);
static void stop_add_favorite(StopItem* stop);
static void stop_del_favorite(StopItem* stop);

//////////////////////////////////////////////////////////////////////
//
//       Debug Functions
//
//////////////////////////////////////////////////////////////////////

static void log_msg_error(AppMessageResult ret){
	if(ret == APP_MSG_OK){
		APP_LOG(APP_LOG_LEVEL_INFO, "Message Sent");
	}else if(ret == APP_MSG_SEND_TIMEOUT ){
		APP_LOG(APP_LOG_LEVEL_INFO, "Message Send Timeout");
	}else if(ret == APP_MSG_SEND_REJECTED ){
		APP_LOG(APP_LOG_LEVEL_INFO, "Message Send Rejected");
	}else if(ret == APP_MSG_NOT_CONNECTED ){
		APP_LOG(APP_LOG_LEVEL_INFO, "Message Send App Not Connected");
	}else if(ret == APP_MSG_APP_NOT_RUNNING ){
		APP_LOG(APP_LOG_LEVEL_INFO, "Message Send App Not Running");
	}else if(ret == APP_MSG_INVALID_ARGS ){
		APP_LOG(APP_LOG_LEVEL_INFO, "Message Invalid Args");
	}else if(ret == APP_MSG_BUSY ){
		APP_LOG(APP_LOG_LEVEL_INFO, "Message Send Busy");
	}else if(ret == APP_MSG_BUFFER_OVERFLOW ){
		APP_LOG(APP_LOG_LEVEL_INFO, "Message Send Buffer Overflow");
	}else if(ret == APP_MSG_ALREADY_RELEASED ){
		APP_LOG(APP_LOG_LEVEL_INFO, "Message Send Already Released");
	}else if(ret == APP_MSG_CALLBACK_ALREADY_REGISTERED ){
		APP_LOG(APP_LOG_LEVEL_INFO, "Message Send Already Registered");
	}else if(ret == APP_MSG_CALLBACK_NOT_REGISTERED ){
		APP_LOG(APP_LOG_LEVEL_INFO, "Message Send Not Registered");
	}else if(ret == APP_MSG_OUT_OF_MEMORY ){
		APP_LOG(APP_LOG_LEVEL_INFO, "Message Send Out of Memory");
	}else{
		APP_LOG(APP_LOG_LEVEL_INFO, "Unknown Message Status: %u", ret);
	}
}

//////////////////////////////////////////////////////////////////////
//                                                                  //
//       Global Message Handling                                    //
//                                                                  //
//////////////////////////////////////////////////////////////////////
enum {
	STATUS_MESSAGE = 0,

	GET_STOPS = 10,
	LIST_STOPS_RESET = 11,
	LIST_STOPS_SITE_ID = 12,
	LIST_STOPS_LOCATION = 13,
	LIST_STOPS_ROUTES = 14,
	LIST_STOPS_IS_FAVORITE = 15,

	GET_STOP_TIMES = 20,
	LIST_STOP_TIMES_RESET = 21,
	LIST_STOP_TIMES_BLOCK = 22,
	LIST_STOP_TIMES_ROUTE = 23,
	LIST_STOP_TIMES_DEPART = 24,

	ADD_FAVORITE_STOP = 41,
	DEL_FAVORITE_STOP = 42,
};

enum {
	NEARBY = 0,
	FAVORITES = 1,
};


static void out_failed_handler(DictionaryIterator *failed, AppMessageResult reason, void *context) {
	APP_LOG(APP_LOG_LEVEL_INFO, "Error in `out_failed_handler':");
	log_msg_error(reason);
}

static void out_sent_handler(DictionaryIterator *sent, void *context) {
}

static void in_received_handler(DictionaryIterator *received, void *context) {
	Tuple *stops_tuple = dict_find(received, GET_STOPS);
	Tuple *times_tuple = dict_find(received, GET_STOP_TIMES);

	// If message is a grouping, let it be handled by custom handler.
	if (stops_tuple) {
		handle_stops_message(received);
	}else if (times_tuple) {
		handle_times_message(received);
	}else{
		// Check for other or unknown fields.
		Tuple* message_tuple = dict_read_first(received);

		while (message_tuple) {
			switch (message_tuple->key) {
				case STATUS_MESSAGE:
					// TODO: Add message popup on status message.
					break;
				default:
					APP_LOG(APP_LOG_LEVEL_WARNING, "Unknown Message Type");
			}
			message_tuple = dict_read_next(received);
		}
	}
}

static void in_dropped_handler(AppMessageResult reason, void *context) {
	APP_LOG(APP_LOG_LEVEL_INFO, "Error in `in_dropped_handler':");
	log_msg_error(reason);
}


//////////////////////////////////////////////////////////////////////
//
//       Functions for Stop List
//
//////////////////////////////////////////////////////////////////////

GBitmap* check_mark;

static StopItem stop_list_items[MAX_STOP_LIST_ITEMS];
static int stop_list_count = 0;

static Window *stops_window;
static MenuLayer *stops_menu_layer;

static const int num_stops_menu_sections = 1;
static int num_stops_menu_items[1] = {1};

static uint16_t stops_menu_get_num_sections_callback(MenuLayer *menu_layer, void *data) {
	return num_stops_menu_sections;
}

static uint16_t stops_menu_get_num_rows_callback(MenuLayer *menu_layer, uint16_t section_index, void *data) {
	if(section_index > num_stops_menu_sections)
		return 0;

	return num_stops_menu_items[section_index];
}

static void stops_menu_draw_row_callback(GContext* ctx, const Layer *cell_layer, MenuIndex *cell_index, void *data) {
	GBitmap* icon = NULL;

	switch (cell_index->section) {
		// Should only be one section
		case 0:
			if(cell_index->row < stop_list_count) {

				if(stop_list_items[cell_index->row].is_favorite){
					icon = check_mark;
				}

				menu_cell_basic_draw(ctx,
				                     cell_layer,
				                     stop_list_items[cell_index->row].location,
				                     stop_list_items[cell_index->row].routes,
				                     icon);

			}else if(stop_list_count == 0 && cell_index->row == 0){
				// TODO: Add status variable and update the loading text below with
				//       the current action happening in the js app.
				menu_cell_basic_draw(ctx, cell_layer, "Please Wait", "Loading...", NULL);
			}
			break;
	}
}

// Here we capture when a user selects a menu item
static void stops_menu_select_callback(MenuLayer *menu_layer, MenuIndex *cell_index, void *data) {
	StopItem* stop;

	// Show Stop if Exists
	if( (stop = get_stop_list_item_at_index(cell_index->row)) != NULL) {
		init_stop_times(stop);
	}

}
// Here we capture when a user selects a menu item
static void stops_menu_select_long_callback(MenuLayer *menu_layer, MenuIndex *cell_index, void *data) {
	StopItem* stop;

	// Show Stop if Exists
	if( (stop = get_stop_list_item_at_index(cell_index->row)) != NULL) {
		if(stop->is_favorite == false){
			stop_add_favorite(stop);
			stop->is_favorite = true;
		}else{
			stop_del_favorite(stop);
			stop->is_favorite = false;
		}
		menu_layer_reload_data(menu_layer);
	}

}

static void stops_window_load(Window *window) {
	check_mark = gbitmap_create_with_resource(RESOURCE_ID_IMAGE_MENU_ICON_CHECK_MARK);

	Layer *window_layer = window_get_root_layer(stops_window);
	GRect bounds = layer_get_frame(window_layer);

	stops_menu_layer = menu_layer_create(bounds);

	menu_layer_set_callbacks(stops_menu_layer, NULL, (MenuLayerCallbacks){
		.get_num_sections = stops_menu_get_num_sections_callback,
		.get_num_rows = stops_menu_get_num_rows_callback,
		.draw_row = stops_menu_draw_row_callback,
		.select_click = stops_menu_select_callback,
		.select_long_click = stops_menu_select_long_callback,
	});

	menu_layer_set_click_config_onto_window(stops_menu_layer, stops_window);

	layer_add_child(window_layer, menu_layer_get_layer(stops_menu_layer));
}

static void stops_window_unload(Window *window) {
	gbitmap_destroy(check_mark);
	menu_layer_destroy(stops_menu_layer);
}

static StopItem* get_stop_list_item_at_index(int index) {
	if (index < 0 || index >= MAX_STOP_LIST_ITEMS) {
		return NULL;
	}

	return &stop_list_items[index];
}

static void stops_append_location(int site_id, char* location, char* routes, bool is_favorite) {
	if (stop_list_count >= MAX_STOP_LIST_ITEMS) { 
		return;
	}

	stop_list_items[stop_list_count].site_id = site_id;
	strncpy(stop_list_items[stop_list_count].location, location, MAX_STOP_LOCATION_LENGTH);
	strncpy(stop_list_items[stop_list_count].routes, routes, MAX_STOP_ROUTES_LENGTH);
	stop_list_items[stop_list_count++].is_favorite = is_favorite;


	num_stops_menu_items[0] = stop_list_count;
	menu_layer_reload_data(stops_menu_layer); 
}

static void handle_stops_message(DictionaryIterator* received){
	// Check for fields you expect to receive
	Tuple *reset_tuple = dict_find(received, LIST_STOPS_RESET);
	Tuple *site_id_tuple = dict_find(received, LIST_STOPS_SITE_ID);
	Tuple *location_tuple = dict_find(received, LIST_STOPS_LOCATION);
	Tuple *routes_tuple = dict_find(received, LIST_STOPS_ROUTES);
	Tuple *is_favorite_tuple = dict_find(received, LIST_STOPS_IS_FAVORITE);

	if (reset_tuple) {
		stop_list_count = 0;
	}else if (site_id_tuple && location_tuple && routes_tuple) {
		stops_append_location(site_id_tuple->value->int32,
													location_tuple->value->cstring,
													routes_tuple->value->cstring,
													is_favorite_tuple->value->int8);
	}else{
		// Check for unexpected fields.
		Tuple* message_tuple = dict_read_first(received);

		while (message_tuple) {
			switch (message_tuple->key) {
				case  GET_STOPS:
					break;
				default:
					APP_LOG(APP_LOG_LEVEL_INFO, "Unknown Message Type");
			}
			message_tuple = dict_read_next(received);
		}
	}
}

static void stop_add_favorite(StopItem* stop){
	// Send Message to Get Nearest Stops
	DictionaryIterator *msg_dict;
	app_message_outbox_begin(&msg_dict);

	Tuplet favorite = TupletInteger(ADD_FAVORITE_STOP, stop->site_id);
	dict_write_tuplet(msg_dict, &favorite);

	AppMessageResult ret = app_message_outbox_send();
	log_msg_error(ret);

}

static void stop_del_favorite(StopItem* stop){
	// Send Message to Get Nearest Stops
	DictionaryIterator *msg_dict;
	app_message_outbox_begin(&msg_dict);

	Tuplet favorite = TupletInteger(DEL_FAVORITE_STOP, stop->site_id);
	dict_write_tuplet(msg_dict, &favorite);

	AppMessageResult ret = app_message_outbox_send();
	log_msg_error(ret);

}


// External Call to Start the Process to Show Favorite Stops
static void stops_show_favorites() {
	// Reset counter values to prevent old data being shown.
	num_stops_menu_items[0] = 1;
	stop_list_count = 0;

	// Send Message to Get Favorite Stops
	DictionaryIterator *msg_dict;
	app_message_outbox_begin(&msg_dict);

	Tuplet value = TupletInteger(GET_STOPS, FAVORITES);
	dict_write_tuplet(msg_dict, &value);

	AppMessageResult ret = app_message_outbox_send();
	log_msg_error(ret);

	// Load New Window
	stops_window = window_create();
	window_set_window_handlers(stops_window, (WindowHandlers) {
		.load = stops_window_load,
		.unload = stops_window_unload,
	});
	window_stack_push(stops_window, ANIMATED);
}

// External Call to Start the Process to Show Favorite Stops
static void stops_show_nearby() {
	// Reset counter values to prevent old data being shown.
	num_stops_menu_items[0] = 1;
	stop_list_count = 0;

	// Send Message to Get Nearest Stops
	DictionaryIterator *msg_dict;
	app_message_outbox_begin(&msg_dict);

	Tuplet value = TupletInteger(GET_STOPS, NEARBY);
	dict_write_tuplet(msg_dict, &value);

	AppMessageResult ret = app_message_outbox_send();
	log_msg_error(ret);

	// Load New Window
	stops_window = window_create();
	window_set_window_handlers(stops_window, (WindowHandlers) {
		.load = stops_window_load,
		.unload = stops_window_unload,
	});
	window_stack_push(stops_window, ANIMATED);
}

//////////////////////////////////////////////////////////////////////
//
//       Functions for Time List
//
//////////////////////////////////////////////////////////////////////

#define MAX_TIME_LIST_ITEMS (10)
#define MAX_TIME_ROUTE_LENGTH (32)
#define MAX_TIME_DEPART_LENGTH (16)

typedef struct {
	int block;
	char route[MAX_TIME_ROUTE_LENGTH];
	char depart[MAX_TIME_DEPART_LENGTH];
} TimeItem;

static StopItem* stop;

static TimeItem time_list_items[MAX_TIME_LIST_ITEMS];
static int time_list_count;

static Window *times_window;
static MenuLayer *times_menu_layer;

static const int num_times_menu_sections = 1;
static int num_times_menu_items[1];

static uint16_t times_menu_get_num_sections_callback(MenuLayer *menu_layer, void *data) {
	return num_times_menu_sections;
}

static uint16_t times_menu_get_num_rows_callback(MenuLayer *menu_layer, uint16_t section_index, void *data) {
	if(section_index > num_times_menu_sections)
		return 0;

	return num_times_menu_items[section_index];
}

static void times_menu_draw_row_callback(GContext* ctx, const Layer *cell_layer, MenuIndex *cell_index, void *data) {
	switch (cell_index->section) {
		// Should only be one section
		case 0:
			if(cell_index->row < time_list_count) {
				menu_cell_basic_draw(ctx,
														 cell_layer,
														 time_list_items[cell_index->row].route,
														 time_list_items[cell_index->row].depart,
														 NULL);

			}else if(time_list_count == 0 && cell_index->row == 0){
				// TODO: Add status variable and update the loading text below with
				//       the current action happening in the js app as well as for
				//       error messages.
				menu_cell_basic_draw(ctx, cell_layer, "Please Wait", "Loading...", NULL);
			}
			break;
	}
}

static void times_menu_select_callback(MenuLayer *menu_layer, MenuIndex *cell_index, void *data) {
	//For all Rows, Pressing Select Refreshes

	// Send Message to Get Nearest Times
	DictionaryIterator *msg_dict;
	app_message_outbox_begin(&msg_dict);

	Tuplet value = TupletInteger(GET_STOP_TIMES, stop->site_id);
	dict_write_tuplet(msg_dict, &value);

	AppMessageResult ret = app_message_outbox_send();
	log_msg_error(ret);

	time_list_count = 0;
	num_times_menu_items[0] = 1;

	menu_layer_reload_data(menu_layer);

	// Use the row to specify which item will receive the select action
	if(cell_index->row <= time_list_count) {
		// TODO: Figure out using long-press to watch and notify
	}

}

static void times_window_load(Window *window) {
	Layer *window_layer = window_get_root_layer(times_window);
	GRect bounds = layer_get_frame(window_layer);

	times_menu_layer = menu_layer_create(bounds);

	menu_layer_set_callbacks(times_menu_layer, NULL, (MenuLayerCallbacks){
		.get_num_sections = times_menu_get_num_sections_callback,
		.get_num_rows = times_menu_get_num_rows_callback,
		.draw_row = times_menu_draw_row_callback,
		.select_click = times_menu_select_callback,
	});

	menu_layer_set_click_config_onto_window(times_menu_layer, times_window);

	layer_add_child(window_layer, menu_layer_get_layer(times_menu_layer));
}

static void times_window_unload(Window *window) {
	menu_layer_destroy(times_menu_layer);
}

static TimeItem* get_time_list_item_at_index(int index) {
	if (index < 0 || index >= MAX_TIME_LIST_ITEMS) {
		return NULL;
	}

	return &time_list_items[index];
}

static void times_append_depart(int block, char *route, char *depart) {
	if (time_list_count >= MAX_TIME_LIST_ITEMS) { 
		return;
	}

	time_list_items[time_list_count].block = block;
	strncpy(time_list_items[time_list_count].route, route, MAX_TIME_ROUTE_LENGTH);
	strncpy(time_list_items[time_list_count++].depart, depart, MAX_TIME_ROUTE_LENGTH);

	num_times_menu_items[0] = time_list_count;
	menu_layer_reload_data(times_menu_layer); 
}

static void handle_times_message(DictionaryIterator *received){
	Tuple *reset_tuple = dict_find(received, LIST_STOP_TIMES_RESET);
	Tuple *block_tuple = dict_find(received, LIST_STOP_TIMES_BLOCK);
	Tuple *route_tuple = dict_find(received, LIST_STOP_TIMES_ROUTE);
	Tuple *depart_tuple = dict_find(received, LIST_STOP_TIMES_DEPART);

	// If message is a grouping, let it be handled by custom handler.
	if (reset_tuple) {
		//About to receive fresh list of nearby times, clear existing.
		time_list_count = 0;
	}else if (block_tuple && route_tuple && depart_tuple) {
		times_append_depart(block_tuple->value->int32,
												route_tuple->value->cstring,
												depart_tuple->value->cstring);
	}else{
		// Check for unexpected fields.
		Tuple* message_tuple = dict_read_first(received);

		while (message_tuple) {
			switch (message_tuple->key) {
				case  GET_STOP_TIMES:
					break;
				default:
					APP_LOG(APP_LOG_LEVEL_INFO, "Unknown Message Type");
			}
			message_tuple = dict_read_next(received);
		}
	}
}

// External Callback to Display List of Stop Times 
static void init_stop_times(StopItem* stop_to_show) {
	// Init Globals
	time_list_count = 0;
	num_times_menu_items[0] = 1;
	stop = stop_to_show;

	// Send Message to Get Nearest Times
	DictionaryIterator *msg_dict;
	app_message_outbox_begin(&msg_dict);

	Tuplet value = TupletInteger(GET_STOP_TIMES, stop->site_id);
	dict_write_tuplet(msg_dict, &value);

	AppMessageResult ret = app_message_outbox_send();
	log_msg_error(ret);

	// Load New Window
	times_window = window_create();
	window_set_window_handlers(times_window, (WindowHandlers) {
		.load = times_window_load,
		.unload = times_window_unload,
	});
	window_stack_push(times_window, ANIMATED);
}

//////////////////////////////////////////////////////////////////////
//                                                                  //
//       Main Menu                                                  //
//                                                                  //
//////////////////////////////////////////////////////////////////////
static Window *main_window;
static SimpleMenuItem main_menu_items[4];
static SimpleMenuSection main_menu_sections[1];
static SimpleMenuLayer* main_menu_layer;

static void main_menu_find_me_callback(int index, void *ctx) {
	stops_show_nearby();
}

static void main_menu_favorites_callback(int index, void *ctx) {
	stops_show_favorites();
}

static void main_window_load(Window *main_window) {
	int num_a_items = 0;

	main_menu_items[num_a_items++] = (SimpleMenuItem){
		.title = "Find Me",
		.callback = main_menu_find_me_callback,
	};
	main_menu_items[num_a_items++] = (SimpleMenuItem){
		.title = "Favorite Stops",
		.callback = main_menu_favorites_callback,
	};
/*
	main_menu_items[num_a_items++] = (SimpleMenuItem){
		.title = "Options",
	};
	main_menu_items[num_a_items++] = (SimpleMenuItem){
		.title = "Menu Item with a Long Title",
		.subtitle = "Menu Item with a Long Subitle Too",
	};*/

	main_menu_sections[0] = (SimpleMenuSection){
		.num_items = num_a_items,
		.items = main_menu_items,
	};

	Layer *window_layer = window_get_root_layer(main_window);
	GRect bounds = layer_get_frame(window_layer);

	main_menu_layer = simple_menu_layer_create(bounds,
																						 main_window,
																						 main_menu_sections,
																						 1,
																						 NULL);

	layer_add_child(window_layer, simple_menu_layer_get_layer(main_menu_layer));
}

static void main_window_unload(Window *main_window) {
	simple_menu_layer_destroy(main_menu_layer);
}

static void init(void) {
	main_window = window_create();
	window_set_window_handlers(main_window, (WindowHandlers) {
		.load = main_window_load,
		.unload = main_window_unload,
	});
	window_stack_push(main_window, ANIMATED);

	const uint32_t inbound_size = app_message_inbox_size_maximum();
	const uint32_t outbound_size = app_message_outbox_size_maximum();

	app_message_register_inbox_received(in_received_handler);
	app_message_register_inbox_dropped(in_dropped_handler);
	app_message_register_outbox_sent(out_sent_handler);
	app_message_register_outbox_failed(out_failed_handler);

	app_message_open(inbound_size, outbound_size);
}

static void deinit(void) {
	window_destroy(main_window);
}

//////////////////////////////////////////////////////////////////////
//                                                                  //
//       Main                                                       //
//                                                                  //
//////////////////////////////////////////////////////////////////////

int main(void) {
	init();

	APP_LOG(APP_LOG_LEVEL_DEBUG, "Done initializing, pushed window: %p", main_window);

	app_event_loop();
	deinit();
}
